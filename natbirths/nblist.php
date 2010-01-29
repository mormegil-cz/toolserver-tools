<?php

error_reporting(E_ALL);
ini_set('display_errors', 1);

require_once(dirname( __FILE__ ) . '/../includes/db.php');

$db = connect_to_db('cswiki');
if (!$db)
{
	header('Status: 500');
	echo 'Error connecting to database';
	return;
}

function process_years($basetitle)
{
  global $db;

  $queryresult = mysql_query("SELECT cl_to, COUNT(*) FROM categorylinks WHERE cl_to LIKE '$basetitle\\_____' GROUP BY cl_to", $db);
  if (!$queryresult)
  {
  	header('Status: 500');
  	die('Error executing query');
  }

  $basetitlelen = strlen($basetitle) + 1;

  $result = array();

  while ($row = mysql_fetch_row($queryresult))
  {
      $catname = $row[0];
      $count = $row[1];

      $year = substr($catname, $basetitlelen);
      $result[$year] = $count;
  }

  return $result;
}

$births = process_years('Narození');
$deaths = process_years('Úmrtí');

$now = intval(date('Y'));

header('Content-Type: text/csv; charset=utf-8; header=absent')
for ($y = 1000; $y <= $now; ++$y)
{
    $b = isset($births[$y]) ? $births[$y] : 0;
    $d = isset($deaths[$y]) ? $deaths[$y] : 0;
    echo "$y;$b;$d\n";
}
