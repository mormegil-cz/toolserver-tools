<?php

// ----- config -----

define('MAX_AUTID_LENGTH', 32);
define('MAX_CALLBACK_LENGTH', 32);
define('MAX_CACHING_TIME', 86400);
define('LOGGING_ENABLED', false);

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

// ---- perform the DB query ----

$toolserver_mycnf = parse_ini_file('/home/' . get_current_user() . '/.my.cnf');
$db = mysql_connect('cswiki-p.db.toolserver.org', $toolserver_mycnf['user'], $toolserver_mycnf['password']);
if (!$db)
{
	header('Status: 500');
	echo '// Error connecting to database';
	echo "$callback(null);";
	return;
}
if (!mysql_select_db('cswiki_p', $db))
{
	header('Status: 500');
	echo '// Error selecting database';
	echo "$callback(null);";
	return;
}
unset($toolserver_mycnf);

$queryresult = mysql_query("SELECT page_namespace, page_title FROM categorylinks INNER JOIN page ON cl_from=page_id WHERE cl_to='Články_s_odkazem_na_autoritní_záznam' AND cl_sortkey='" . mysql_real_escape_string($autid) . "'", $db);
if (!$queryresult) {
	header('Status: 500');
	echo '// Error executing query';
	echo "$callback(null);";
	return;
}

// ---- process the result ----

$retrievedData = array();
$resultitems = array();
while ($row = mysql_fetch_row($queryresult))
{
    $ns = $row[0];
    if ($ns != 0) continue;

    $title = $row[1];

	$url = 'http://cs.wikipedia.org/wiki/' . urlencode($title);
	$resultitems[] = array('title' => str_replace('_', ' ', $title), 'url' => $url);
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
