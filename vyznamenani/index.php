<?php
/*
    Copyright © 2015 Petr Kadlec <mormegil@centrum.cz>

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

error_reporting(E_ALL & ~E_DEPRECATED);
ini_set('display_errors', 1);

function connect_to_db($dbname)
{
	$dbname = str_replace('-', '_', $dbname);
	$toolserver_mycnf = parse_ini_file(__DIR__ . '/../../replica.my.cnf');
	$db = mysqli_connect("$dbname.web.db.svc.wikimedia.cloud", $toolserver_mycnf['user'], $toolserver_mycnf['password'], "${dbname}_p");
	if (!$db) return null;
	unset($toolserver_mycnf);
	return $db;
}

function scalar_query($db, $query)
{
	$result = mysqli_query($db, $query);
	if (!$result) return FALSE;
	$row = mysqli_fetch_row($result);
	if (!$row) {
		mysqli_free_result($result);
		return FALSE;
	}
	mysqli_free_result($result);
	return $row[0];
}

function get_variable_or_null($id)
{
	if (isset($_POST[$id])) return $_POST[$id];
	if (isset($_GET[$id])) return $_GET[$id];
	return null;
}

function plural($n, $one, $few, $many)
{
	if ($n == 1) return $one;
	else if ($n >= 2 && $n <= 4) return $few;
	else return $many;
}

$user = get_variable_or_null('user');
if ($user) $user = str_replace('_', ' ', $user);

define('DEF_ID', 0);
define('DEF_TITLE', 1);
define('DEF_MINEDITS', 2);
define('DEF_INTERVAL', 3);

$project = 'cswiki';

$award_definitions = array();
$award_definitions['cswiki'] = array();
$award_definitions['cswiki'][] = array('platinova-medaile-velmistra-wikipedie', 'Platinová medaile velmistra Wikipedie', 100000, new DateInterval('P10Y'));
$award_definitions['cswiki'][] = array('mudrc-i-tridy', 'Mudrc I. třídy', 85000, new DateInterval('P8Y6M'));
$award_definitions['cswiki'][] = array('mudrc-ii-tridy', 'Mudrc II. třídy', 70000, new DateInterval('P7Y'));
$award_definitions['cswiki'][] = array('mudrc-iii-tridy', 'Mudrc III. třídy', 60000, new DateInterval('P6Y'));
$award_definitions['cswiki'][] = array('medaile-mistra-wikipedie', 'Medaile mistra Wikipedie', 50000, new DateInterval('P5Y'));
$award_definitions['cswiki'][] = array('veteran-i-tridy', 'Veterán I. třídy', 40000, new DateInterval('P4Y6M'));
$award_definitions['cswiki'][] = array('veteran-ii-tridy', 'Veterán II. třídy', 30000, new DateInterval('P4Y'));
$award_definitions['cswiki'][] = array('veteran-iii-tridy', 'Veterán III. třídy', 20000, new DateInterval('P3Y6M'));
$award_definitions['cswiki'][] = array('medaile-profesionalniho-uzivatele', 'Medaile profesionálního uživatele', 16000, new DateInterval('P3Y'));
$award_definitions['cswiki'][] = array('wikipedista-i-tridy', 'Wikipedista I. třídy', 12000, new DateInterval('P2Y6M'));
$award_definitions['cswiki'][] = array('wikipedista-ii-tridy', 'Wikipedista II. třídy', 8000, new DateInterval('P2Y'));
$award_definitions['cswiki'][] = array('wikipedista-iii-tridy', 'Wikipedista III. třídy', 6000, new DateInterval('P1Y6M'));
$award_definitions['cswiki'][] = array('medaile-zkuseneho-uzivatele', 'Medaile zkušeného uživatele', 4000, new DateInterval('P1Y'));
$award_definitions['cswiki'][] = array('student', 'Student', 2000, new DateInterval('P6M'));
$award_definitions['cswiki'][] = array('ucen', 'Učeň', 1000, new DateInterval('P3M'));
$award_definitions['cswiki'][] = array('novacek', 'Nováček', 200, new DateInterval('P1M'));

$project_userpage_prefix = array();
$project_userpage_prefix['cswiki'] = 'https://cs.wikipedia.org/wiki/Wikipedista:';

date_default_timezone_set('UTC');

$now = new DateTime();

?>
<!DOCTYPE HTML>
<html>
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <title>Vyznamenání za věrnost Wikipedii</title>
</head>
<body>
    <h1>Vyznamenání za věrnost Wikipedii</h1>

<?php

if (!isset($award_definitions[$project])) {
	echo '<div class="error">Neznámý/nepodporovaný projekt</div>';
	echo '</body></html>';
	return;
}
$award_definitions = $award_definitions[$project];

$db = connect_to_db($project);
if (!$db) {
	echo '<div class="error">Nepodařilo se připojit k databázi!</div>';
	echo '</body></html>';
	return;
}

if ($user) {
	$query = "SELECT user_name, user_editcount, user_registration, user_id FROM user WHERE user_name='" . mysqli_real_escape_string($db, $user) . "'";
} else {
	$query = 'SELECT user_name, user_editcount, user_registration FROM user WHERE user_editcount>=' . ($award_definitions[count($award_definitions) - 1][DEF_MINEDITS] . ' LIMIT 10000');
}

$queryresult = mysqli_query($db, $query);
if (!$queryresult) {
	echo '<div class="error">Chyba při provádění dotazu do databáze!</div>';
	echo '</body></html>';
	return;
}

$award_mapping = array();
$user_row = null;
$user_award = null;

while (!!($row = mysqli_fetch_assoc($queryresult))) {
	$username = $row['user_name'];
	$editcount = $row['user_editcount'];
	$registration = $row['user_registration'];
	if (!$registration) $registration = '20051201000000';

	$registration_date = DateTime::createFromFormat('YmdHis', $registration);

	$user_row = $row;

	for ($i = 0; $i < count($award_definitions); ++$i) {
		$def = $award_definitions[$i];
		$timelimit = clone $registration_date;
		$timelimit->add($def[DEF_INTERVAL]);
		if ($editcount >= $def[DEF_MINEDITS] && $timelimit <= $now) {
			if (!isset($award_mapping[$i])) $award_mapping[$i] = array();
			$award_mapping[$i][] = $row;
			$user_award = $def;
			break;
		}
	}
}
mysqli_free_result($queryresult);

if ($user) {
	echo '<p><a href="' . htmlspecialchars($project_userpage_prefix[$project] . str_replace(' ', '_', $user), ENT_QUOTES) . '">' . htmlspecialchars($user) . '</a> ';
	if (!$user_row) {
		echo 'není mně známý uživatel.</p>';
	} else {
		$editcount = $user_row['user_editcount'];
		$registration = $user_row['user_registration'];
		$userid = $user_row['user_id'];

		$actorid = scalar_query($db, "SELECT actor_id FROM actor_revision WHERE actor_user=$userid");

		$firstedit = !$actorid ? null : scalar_query($db, "SELECT MIN(rev_timestamp) FROM revision_userindex WHERE rev_actor=$actorid");
		if (!$firstedit) $firstedit = $registration;

		echo " má na kontě $editcount ";
		echo plural($editcount, 'editaci', 'editace', 'editací');

		echo ' a na Wikipedii je ';
		$firstedit_date = DateTime::createFromFormat('YmdHis', $firstedit);
		$interval = $now->diff($firstedit_date);
		echo $interval->y;
		echo plural($interval->y, ' rok', ' roky', ' let');
		echo ", $interval->m ";
		echo plural($interval->m, 'měsíc', 'měsíce', 'měsíců');
		echo " a $interval->d ";
		echo plural($interval->d, 'den', 'dny', 'dní');
		echo '.</p>';

		if ($user_award && $actorid) {
			echo '<h2>Dosažení vyznamenání</h2>';
			echo '<ul>';
			for ($i = count($award_definitions) - 1; $i >= 0; --$i) {
				$def = $award_definitions[$i];

				$skipcount = $def[DEF_MINEDITS] - 1;
				$nth_edit = scalar_query($db, "SELECT rev_timestamp FROM revision_userindex WHERE rev_actor=$actorid ORDER BY rev_timestamp LIMIT $skipcount, 1");
				if (!$nth_edit) break;

				$timelimit = clone $firstedit_date;
				$timelimit->add($def[DEF_INTERVAL]);

				$nthedit_date = DateTime::createFromFormat('YmdHis', $nth_edit);
				if ($timelimit <= $nthedit_date) {
					$awarded_date = $nthedit_date;
				} else {
					if ($timelimit > $now) break;
					$awarded_date = $timelimit;
				}

				echo '<li><em>' . htmlspecialchars($def[DEF_TITLE]) . '</em> – ' . $awarded_date->format('d. m. Y') . '</li>';
			}
			echo '</ul>';
		}
	}
} else {
	for ($i = 0; $i < count($award_definitions); ++$i) {
		if (!isset($award_mapping[$i])) continue;

		$def = $award_definitions[$i];
		$list = $award_mapping[$i];
		echo '<h2 id="' . $def[DEF_ID] . '">' . $def[DEF_TITLE] . '</h2>';
		echo '<ul>';
		for ($j = 0; $j < count($list); ++$j) {
			$userrow = $list[$j];
			$username = $userrow['user_name'];
			echo '<li><a href="?user=' . htmlspecialchars(urlencode($username), ENT_QUOTES) . '">' . htmlspecialchars($username) . '</a></li>';
		}
		echo '</ul>';
	}
}

?>
</body>
</html>
<?php
