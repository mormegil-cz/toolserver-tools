<?php

error_reporting(E_ALL & ~E_DEPRECATED);
ini_set('display_errors', 1);

require_once(dirname( __FILE__ ) . '/../includes/db.php');

$project = 'cs';
$projectdb = $project . 'wiki';

$db = connect_to_db($projectdb);
if (!$db) die('Error connecting to database');

$url = 'http://newipnow.com/';
$input = @file_get_contents($url) or die("Could not access file: $url");

preg_match_all('/"ip":"([0-9.]*)"/siU', $input, $matches) or die('Error parsing page');
$addresses = $matches[1];

header('Content-Type: application/atom+xml');
echo '<?xml version="1.0" encoding="utf-8"?>';
echo '<feed xmlns="http://www.w3.org/2005/Atom">';
echo '<title>Newipnow.com blocking tool</title>';
echo "<link rel='self' href='http://toolserver.org/~mormegil/newipnow/check.php?project=$project' />";
echo '<updated>' . date('c') . '</updated>';
echo '<author><name>Petr Kadlec</name><uri>https://$project.wikipedia.org/wiki/User:Mormegil</uri></author>';
echo "<id>http://toolserver.org/~mormegil/newipnow.com/check.php?project=$project</id>";

foreach($addresses as $ip)
{
    $queryresult = mysql_query('SELECT COUNT(*) FROM ipblocks WHERE ipb_address=\'' . mysql_real_escape_string($ip) . '\'', $db);
	if (!$queryresult) die('Error executing query');
	$resarray = mysql_fetch_array($queryresult);
	if (!$resarray || !$resarray[0])
	{
		$iphead = @file_get_contents("http://$ip/");
		$checkflag = "– ?";
		$description = null;
		if ($iphead)
		{
			$checkflag = " – checked";
			$description = 'Checked: ' . htmlspecialchars(substr($iphead, 0, 100));
		}
		else
		{
			$checkflag = " – no response";
			$description = 'No HTTP response!';
		}
		echo "<entry>\n";
		echo "<title>$ip$checkflag</title>";
		echo "<link href='https://$project.wikipedia.org/wiki/Special:Block/$ip?wpExpiry=indefinite&amp;wpReason=other&amp;wpReason-other=%7b%7bblocked%20open%20proxy%7cnewipnow.com%7d%7d&amp;wpWatch=1&amp;wpHardBlock=1' />";
		echo "<id>http://toolserver.org/~mormegil/newipnow.com/check.php?project=$project&amp;block=$ip</id>";
		echo '<updated>' . date('c') . '</updated>';
		if ($description) echo "<content>$description</content>";
		echo "</entry>\n";
	}
	else
	{
		echo "<!-- Already blocked: $ip -->\n";
	}
}

echo '</feed>';
