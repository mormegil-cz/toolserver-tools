<?php

require_once(dirname( __FILE__ ) . '/../includes/db.php');

$db = connect_to_db('cswiki');
if (!$db) die('Error connecting to database');

$url = 'http://newipnow.com/';
$input = @file_get_contents($url) or die("Could not access file: $url");

preg_match_all('/"ip":"([^"]*)"/siU', $input, $matches) or die('Error parsing page');
$addresses = $matches[1];

foreach($addresses as $ip)
{
    $queryresult = mysql_query('SELECT COUNT(*) FROM ipblocks WHERE ipb_address=\'' . mysql_real_escape_string($ip) . '\'', $db);
	if (!$queryresult) die('Error executing query');
	$resarray = mysql_fetch_array($queryresult);
	if (!$resarray || !$resarray[0])
	{
		echo "Not blocked: $ip\n";
	}
	else
	{
		echo "Blocked: $ip\n";
	}
}
