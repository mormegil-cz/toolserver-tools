<?php
/*
    Copyright © 2010 Petr Kadlec <mormegil@centrum.cz>

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.

*/

error_reporting(E_ALL);
ini_set('display_errors', 1);

$project = null;
$recseparator = ';';

if (php_sapi_name() == 'cli' && empty($_SERVER['REMOTE_ADDR']))
{
  if ($argc != 2) {
    die('Wrong arguments');
  }
  $project = $argv[1];
}
else
{
  if (!isset($_GET['project'])) {
      header('Status: 301');
      header('Location: http://toolserver.org/~mormegil/natbirths/');
      echo('"project" parameter required, use http://toolserver.org/~mormegil/natbirths/');
      return;
  }
  $project = $_GET['project'];
  if (isset($_GET['separator'])) {
    $recseparator = $_GET['separator'];
  }
}

require_once(dirname( __FILE__ ) . '/catnames.php');
require_once(dirname( __FILE__ ) . '/../includes/db.php');

if (!isset($birthcatname[$project]) || !isset($deathcatname[$project])) {
	header('Status: 400');
	die('Nonexisting or unsupported project');
}

$birthcat = $birthcatname[$project];
$deathcat = $deathcatname[$project];

$db = connect_to_db($project . 'wiki');
if (!$db)
{
	header('Status: 500');
	die('Error connecting to database');
}

function process_years_quick($basetitle)
{
  global $db;

  $pattern = str_replace(' ', '_', $basetitle);
  $pattern = str_replace('_', '\\_', $pattern);
  $pattern = str_replace('[yr]', '____', $pattern);
  $queryresult = mysql_query('SELECT cl_to, COUNT(*) FROM categorylinks WHERE cl_to LIKE \'' . mysql_real_escape_string($pattern) . '\' GROUP BY cl_to', $db);
  if (!$queryresult)
  {
  	header('Status: 500');
  	die('Error executing query');
  }

  $basetitlelen = strlen($basetitle) - 4;

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

function process_years_slow($basetitle)
{
  global $db;

  $result = array();

  $now = intval(date('Y'));
  for ($year = 1000; $year <= $now; ++$year)
  {
      $catname = str_replace(' ', '_', $basetitle);
      $catname = str_replace('[yr]', $year, $catname);
      $queryresult = mysql_query('SELECT COUNT(*) FROM categorylinks WHERE cl_to=\'' . mysql_real_escape_string($catname) . '\'', $db);
      if (!$queryresult)
      {
        header('Status: 500');
  	    die('Error executing query');
      }

      if ($row = mysql_fetch_row($queryresult))
      {
        $result[$year] = $row[0];
      }
  }

  return $result;
}

function tails_year($catname)
{
    return substr($catname, strlen($catname) - 4) == '[yr]';
}

$births = tails_year($birthcat) ? process_years_quick($birthcat) : process_years_slow($birthcat);
$deaths = tails_year($deathcat) ? process_years_quick($deathcat) : process_years_slow($deathcat);

$now = intval(date('Y'));

header('Content-Type: text/csv; charset=utf-8; header=absent');
for ($y = 1000; $y <= $now; ++$y)
{
    $b = isset($births[$y]) ? $births[$y] : 0;
    $d = isset($deaths[$y]) ? $deaths[$y] : 0;
    echo "$y$recseparator$b$recseparator$d\n";
}
