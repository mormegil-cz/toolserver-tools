<?php

// ----- config -----

define('MAX_AUTID_LENGTH', 32);
define('MAX_CALLBACK_LENGTH', 32);
define('MAX_CACHING_TIME', 86400);
define('API_TIMEOUT', 30);
define('LOGGING_ENABLED', true);

// ------------------

if (!isset($_GET['autid']) || !isset($_GET['callback']) || !strlen($_GET['autid']) || !strlen($_GET['callback']))
{
	header('Status: 400');
	echo 'Bad query';
	return;
}

$autid = $_GET['autid'];
$callback = $_GET['callback'];

if (strlen($autid) > MAX_AUTID_LENGTH || !preg_match('/^[a-zA-Z0-9_-]*$/', $autid))
{
	header('Status: 400');
	echo "Invalid authority ID";
	return;
}

if (strlen($callback) > MAX_CALLBACK_LENGTH || !preg_match('/^[a-zA-Z_][a-zA-Z_0-9]*$/', $callback))
{
	header('Status: 400');
	echo 'Invalid callback identifier';
	return;
}

// ---- perform the API request ----

$autid = urlencode($autid);

$nocache = time();
$sparqlurl = "https://query.wikidata.org/sparql?query=SELECT%20%3Fentity%20%3FentityLabel%20%3FwikiLink%20%3FlinkLanguage%0AWHERE%20%0A%7B%0A%09%3Fentity%20wdt%3AP691%20%22$autid%22%20.%0A%0A%20%20%20%20OPTIONAL%20%7B%0A%09%20%20%3FwikiLink%20a%20schema%3AArticle%20%3B%0A%09%09schema%3Aabout%20%3Fentity%20%3B%0A%09%09schema%3AinLanguage%20%3FlinkLanguage%20.%0A%20%20%20%20%7D%0A%0A%20%20%20%20SERVICE%20wikibase%3Alabel%20%7B%0A%09%09bd%3AserviceParam%20wikibase%3Alanguage%20%22cs%2Cen%2Csk%2Cde%2Cfr%2Cpl%2Cru%2Cit%2Ces%2Cpt%22%20.%0A%09%7D%0A%7D&format=json&_=$nocache";

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
	header('Status: 500');
	echo "// Could not download data: " . json_encode($curlerror) . "\n";
	echo "$callback(null);";
	return;
}
curl_close($ch);

$retrievedData = json_decode($curlresponse, true);

// ---- process the result ----

if (!$retrievedData)
{
	header('Status: 500');
	echo "// Could not process data\n";
	echo "$callback(null);";
	return;
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
$result = $callback . '(' . json_encode($resultitems) . ');';

// ----- log -----

if (LOGGING_ENABLED)
{
	$logname = dirname(__FILE__) . '/log/' . strftime('%Y%m%d.log');
	$referer = isset($_SERVER['HTTP_REFERER']) ? $_SERVER['HTTP_REFERER'] : '';
	$entry = date('c') . "\t" . $_SERVER['REMOTE_ADDR'] . "\t$autid\t$callback\t" . count($resultitems) . "\n\t" . $_SERVER['HTTP_USER_AGENT'] . "\n\t$referer\n";
	$handle = fopen($logname, 'ab');
	if ($handle)
	{
		$_SERVER['REMOTE_ADDR'];
		fwrite($handle, $entry);
		fclose($handle);
	}
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
