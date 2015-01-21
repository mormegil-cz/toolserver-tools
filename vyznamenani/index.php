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

error_reporting(E_ALL);
ini_set('display_errors', 1);

$available_languages = array('en', 'cs');

require_once(dirname( __FILE__ ) . '/../includes/functions.php');
require_once(dirname( __FILE__ ) . '/../includes/db.php');
require_once(dirname( __FILE__ ) . '/../includes/l10n.php');

$user = get_variable_or_null('user');

$award_definitions = array();
$award_definitions[] = array('Medaile mistra Wikipedie', 50000, 5 * 365);
$award_definitions[] = array('Veterán I. tøídy', 40000, 4 * 365 + 183);
$award_definitions[] = array('Veterán II. tøídy', 30000, 4 * 365);
$award_definitions[] = array('Veterán III. tøídy', 20000, 3 * 365 + 183);
$award_definitions[] = array('Medaile profesionálního uživatele', 16000, 3 * 365);
$award_definitions[] = array('Wikipedista I. tøídy', 12000, 2 * 365 + 183);
$award_definitions[] = array('Wikipedista II. tøídy', 8000, 2 * 365);
$award_definitions[] = array('Wikipedista III. tøídy', 6000, 1 * 365 + 183);
$award_definitions[] = array('Medaile zkušeného uživatele', 4000, 1 * 365);
$award_definitions[] = array('Student', 2000, 183);
$award_definitions[] = array('Uèeò', 1000, 91);
$award_definitions[] = array('Nováèek', 200, 30);


date_default_timezone_set('UTC');

$now = new DateTime();

?>
<!DOCTYPE HTML>
<html>
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <title><?php echo wfMsg('title'); ?></title>
</head>
<body>
    <h1><?php echo wfMsg('title'); ?></h1>

<?php

if ($user) {
	$query = "SELECT user_name, user_editcount, user_registration FROM user WHERE user_name='" . mysql_real_escape_string($user) . "'";
} else {
	$query = 'SELECT user_name, user_editcount, user_registration FROM user WHERE user_editcount>=' . ($award_definitions[count($award_definitions) - 1][1]);
}

$db = connect_to_db('cswiki');
if (!$db) {
	echo '<div class="error">' . wfMsg('error-db') . '</div>';
	echo '</body></html>';
	return;
}
$queryresult = mysql_query($query, $db);
if (!$queryresult) {
	echo '<div class="error">' . wfMsg('error-dbquery') . '</div>';
	echo '</body></html>';
	return;
}

$award_mapping = array();

while (!!($row = mysql_fetch_row($queryresult))) {
	$username = $row[0];
	$editcount = $row[1];
	$registration = $row[2];
	if (!$registration) $registration = '20051201000000';

	$registration_date = DateTime::createFromFormat('Ymd', substr($registration, 0, 8));
	$interval = $now->diff($registration_date);
	$age = $interval->days;

	for ($i = 0; $i < count($award_definitions); ++$i) {
		$def = $award_definitions[$i];
		if ($editcount >= $def[1] && $age >= $def[2]) {
			if (!isset($award_mapping[$i])) $award_mapping[$i] = array();
			$award_mapping[$i][] = $row;
			break;
		}
	}
}

for ($i = 0; $i < count($award_definitions); ++$i) {
	if (!isset($award_mapping[$i])) continue;

	$def = $award_definitions[$i];
	$list = $award_mapping[$i];
	//echo '<h2 id="' . $def[3] . '">' . htmlspecialchars($def[0]) . '</h2>';
	echo '<h2>' . htmlspecialchars($def[0]) . '</h2>';
	echo '<ul>';
	for ($j = 0; $i < count($list); ++$j) {
		$user = $list[j];
		echo '<li><a href="https://cs.wikipedia.org/wiki/Wikipedista:' . htmlspecialchars(str_replace($user[0], ' ', '_'), ENT_QUOTES) . '">' . htmlspecialchars($user[0]) . '</a></li>';
	}
	echo '</ul>';
}

?>
</body>
</html>
<?php
