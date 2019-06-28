<?php

// ----- config -----

define('MAX_AUTID_LENGTH', 32);
define('MAX_CALLBACK_LENGTH', 32);
define('MAX_CACHING_TIME', 86400);
define('API_TIMEOUT', 30);
define('LOGGING_ENABLED', true);
define('MEMCACHED_TIMEOUT', 60 * 60 * 24);
define('MEMCACHED_TIMEOUT_EMPTY', 60 * 30);
define('MEMCACHED_SERVER', '/var/run/memcached/memcached.sock');
define('MEMCACHED_PORT', 0);

// ------------------

function writelog($autid, $entry)
{
	if (!LOGGING_ENABLED) return;

	$logname = dirname(__FILE__) . '/log/' . strftime('%Y%m%d.log');
	// $referer = isset($_SERVER['HTTP_REFERER']) ? $_SERVER['HTTP_REFERER'] : '';
	$handle = fopen($logname, 'ab');
	if ($handle)
	{
		fwrite($handle, date('c') . "\t" . $_SERVER['REMOTE_ADDR'] . "\t$autid\t$entry\n");
		fclose($handle);
	}
}

function queryWikidata($autid)
{
	$nocache = time();
	$sparqlQuery = urlencode(<<<SPARQL
SELECT ?entity ?entityLabel ?wikiLink ?linkLanguage
WHERE
{
	?entity p:P691/ps:P691 "$autid" .

	OPTIONAL {
		?wikiLink a schema:Article ;
		schema:about ?entity ;
		schema:inLanguage ?linkLanguage .
	}

	SERVICE wikibase:label {
		bd:serviceParam wikibase:language "cs,en,sk,de,fr,pl,ru,it,es,pt" .
	}
}
SPARQL
);
	$sparqlurl = "https://query.wikidata.org/sparql?query=$sparqlQuery&format=json&_=$nocache";

	$ch = curl_init();
	curl_setopt($ch, CURLOPT_URL, $sparqlurl);
	curl_setopt($ch, CURLOPT_HEADER, 0);
	curl_setopt($ch, CURLOPT_USERAGENT, 'NK2WP/2.1 (nkp.cz linker service, run by <petr.kadlec@gmail.com>)');
	curl_setopt($ch, CURLOPT_HTTPHEADER, array('From: petr.kadlec@gmail.com'));
	curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
	curl_setopt($ch, CURLOPT_TIMEOUT, API_TIMEOUT);
	$curlresponse = curl_exec($ch);
	if ($curlresponse === FALSE)
	{
		$curlerror = curl_error($ch);
		curl_close($ch);

		writelog($autid, "! Could not download data: " . json_encode($curlerror));
		return null;
	}
	$curlHttpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
	curl_close($ch);

	if ($curlHttpCode !== 200)
	{
		writelog($autid, "! Error received from WQS: $curlHttpCode");
		return null;
	}

	$retrievedData = json_decode($curlresponse, true);
	if (!$retrievedData)
	{
		writelog($autid, "! Could not parse data");
		return null;
	}

	$resultLink = null;
	$linksPerLanguage = array();
	$titlePerLanguage = array();
	$resultBindings = $retrievedData['results']['bindings'];
	$resultBindings = array_filter($resultBindings, function($binding) {
		return !isset($binding['wikiLink']) || preg_match('#^https://[^.]*\.wikipedia\.org/#', $binding['wikiLink']['value']);
	});
	$firstResult = reset($resultBindings);
	if ($firstResult)
	{
		$resultTitle = $firstResult['entityLabel']['value'];
		$resultLink = isset($firstResult['wikiLink']) ? $firstResult['wikiLink']['value'] : null;
		foreach($resultBindings as $item)
		{
			if (isset($item['wikiLink']))
			{
				$linkLang = $item['linkLanguage']['value'];
				$linksPerLanguage[$linkLang] = $item['wikiLink']['value'];
				$titlePerLanguage[$linkLang] = $item['entityLabel']['value'];
			}
		}
		foreach(array('cs', 'en', 'sk', 'de', 'fr', 'pl', 'ru', 'it', 'es', 'pt') as $lang)
		{
			if (isset($linksPerLanguage[$lang]))
			{
				$resultLink = $linksPerLanguage[$lang];
				if (isset($titlePerLanguage[$lang]))
				{
					$resultTitle = $titlePerLanguage[$lang];
				}
				break;
			}
		}
		if (!$resultLink)
		{
			$resultLink = $firstResult['entity']['value'];
		}
	}

	$resultitems = array();
	if ($resultLink)
	{
		$resultLink = str_replace('%20', '_', $resultLink);
		$resultitems[] = array('title' => $resultTitle, 'url' => $resultLink);
	}

	return $resultitems;
}

function initMemcached()
{
	$m = new Memcached();
	$m->addServer(MEMCACHED_SERVER, MEMCACHED_PORT);
	return $m;
}

function getFromMemcached($memcached, $key)
{
	$result = $memcached->get($key);
	if ($result === FALSE) return FALSE;
	return json_decode($result);
}

function storeToMemcached($memcached, $key, $value)
{
	$memcached->set($key, json_encode($value), count($value) ? MEMCACHED_TIMEOUT : MEMCACHED_TIMEOUT_EMPTY);
}

function main()
{
	if (!isset($_GET['autid']) || !isset($_GET['callback']) || !strlen($_GET['autid']) || !strlen($_GET['callback']))
	{
		http_response_code(400);
		writelog('?', "! Bad query");
		echo 'Bad query';
		return;
	}

	$autid = $_GET['autid'];
	$callback = $_GET['callback'];

	if (strlen($autid) > MAX_AUTID_LENGTH || !preg_match('/^[a-zA-Z0-9_-]*$/', $autid))
	{
		http_response_code(400);
		writelog('?', "! Invalid authority ID");
		echo "Invalid authority ID";
		return;
	}

	if (strlen($callback) > MAX_CALLBACK_LENGTH || !preg_match('/^[a-zA-Z_][a-zA-Z_0-9]*$/', $callback))
	{
		http_response_code(400);
		writelog($autid, "! Invalid callback identifier");
		echo 'Invalid callback identifier';
		return;
	}

	// ---- perform the API request ----

	$disableMemcached = isset($_GET['action']) && $_GET['action'] === 'purge';
	$memcached = initMemcached();
	$cachedData = $disableMemcached ? FALSE : getFromMemcached($memcached, $autid);
	if ($cachedData !== FALSE)
	{
		$resultitems = $cachedData;
	}
	else
	{
		$resultitems = queryWikidata($autid);
		if (!is_array($resultitems))
		{
			http_response_code(500);
			echo "$callback(null);";
			return;
		}

		if (MEMCACHED_SERVER)
		{
			storeToMemcached($memcached, $autid, $resultitems);
		}
	}

	$result = $callback . '(' . json_encode($resultitems) . ');';

	// ----- log -----

	if (LOGGING_ENABLED) {
		writelog($autid, "$callback\t" . count($resultitems) . ($cachedData !== FALSE ? ' [c]' : ($disableMemcached ? ' [p]' : '')) . "\n\t" . $_SERVER['HTTP_USER_AGENT']);
	}

	// ---- output ----

	// $mtime = filemtime( __FILE__);

	header('Content-Type: text/javascript');
	header('Content-Length: ' . strlen($result));
	// if ($mtime) header('Last-Modified: ' . gmdate(DATE_RFC1123, $mtime));
	header('Expires: ' . gmdate(DATE_RFC1123, time() + MAX_CACHING_TIME));
	// header("ETag: \"nk2wplinkjs/$mtime/$autid/$callback\"");
	header('Content-MD5: ' . base64_encode(md5($result, true)));

	echo $result;
}

main();
