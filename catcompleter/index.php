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

require_once(dirname( __FILE__ ) . '/../includes/db.php');

$catname = isset($_POST['catname']) ? $_POST['catname'] : null;
$project = isset($_POST['project']) ? $_POST['project'] : null;

?><!DOCTYPE HTML>
<html>
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <title>Category completer</title>
  <link rel="stylesheet" href="http://cs.wikipedia.org/skins-1.5/common/main-ltr.css" media="screen" />
  <link rel="stylesheet" href="http://cs.wikipedia.org/skins-1.5/common/shared.css" media="screen" />
  <script type="text/javascript">
var skin="none",
wgUserLanguage="cs",
wgContentLanguage="cs",
stylepath="http://cs.wikipedia.org/skins-1.5",
wgBreakFrames=false;</script>
  <script src="http://cs.wikipedia.org/skins-1.5/common/wikibits.js" type="text/javascript"></script>
  <style type="text/css">
a { text-decoration: none; color: black; }
a:hover { text-decoration: underline; color: #00e; }
a img { border: none; }
  </style>
</head>
<body class="mediawiki ltr">
    <h1>Category completer</h1>

    <form method="post">
        <table>
            <tr><th><label for="dbname">Home language:</label></th><td><input name="project" id="project" maxlength="20" value="<?php echo $project ? htmlspecialchars($project) : '' ?>" /></td></tr>
            <tr><th><label for="dbname">Category:</label></th><td><input name="catname" id="catname" maxlength="255" value="<?php echo $catname ? htmlspecialchars($catname) : '' ?>" /></td></tr>
            <tr><td colspan="2"><input type="submit" value="Go!" /></td></tr>
        </table>
    </form>
<?php

function execute($catname, $homelang)
{
    $db = connect_to_db($homelang . 'wiki');
    if (!$db)
    {
        echo '<p class="error">Error connecting to database</p>';
        return;
    }

	$catname = title_to_db($catname);

	flush();
	$query = "SELECT ll_lang, ll_title FROM langlinks INNER JOIN page ON ll_from = page_id WHERE page_title = '" . mysql_real_escape_string($catname, $db) . "' AND page_namespace = 14";
    $queryresult = mysql_query($query, $db);
    if (!$queryresult)
    {
        echo '<p class="error">Error executing query: ' . htmlspecialchars(mysql_error()) . '</p>';
        return;
    }

	$interwikis = array();
    while ($row = mysql_fetch_assoc($queryresult))
    {
		$lang = $row['ll_lang'];
		$title = $row['ll_title'];
		$colon = strpos($title, ':');
		if ($colon === FALSE)
		{
			echo '<p class="error">Suspicious interwiki: ' . htmlspecialchars($lang . ": " . $title) . '</p>';
			continue;
		}
		$interwikis[$lang] = substr($title, $colon + 1);
	}

	flush();
	$queryresult = mysql_query("SELECT page_title FROM page INNER JOIN categorylinks ON cl_from = page_id WHERE cl_to = '" . mysql_real_escape_string(title_to_db($catname), $db) . "' AND page_namespace = 0 LIMIT 500", $db);
    if (!$queryresult)
    {
        echo '<p class="error">Error executing query: ' . htmlspecialchars(mysql_error()) . '</p>';
        return;
    }

	flush();
	$localarticles = array();
    while ($row = mysql_fetch_array($queryresult))
    {
		$localarticles[$row[0]] = 1;
	}

	flush();
	$countmissing = 0;
	foreach($interwikis as $lang => $cat)
	{
		flush();
		$remotedb = connect_to_db($lang . 'wiki');
		if (!$remotedb)
		{
			if ($countmissing == 0)
				echo "<p class='error'>Error connecting to $lang</p>";
			else
				echo "<tr><td colspan='2'><div class='error'>Error connecting to $lang</div></td></tr>";

			continue;
		}
		$query = "SELECT ll_title, page_title FROM categorylinks INNER JOIN langlinks ON cl_from = ll_from AND ll_lang = '" .  mysql_real_escape_string($homelang, $remotedb) .  "' INNER JOIN page ON page_id = ll_from WHERE cl_to = '" .  mysql_real_escape_string(title_to_db($cat), $remotedb) . "' AND page_namespace=0 LIMIT 500";
		// echo "<p>" . htmlspecialchars($query) . "</p>\n";
		$result = mysql_query($query, $remotedb);
		if (!$result)
		{
			if ($countmissing == 0)
				echo "<p class='error'>Error processing query at $lang</p>";
			else
				echo "<tr><td colspan='2'><div class='error'>Error  processing query at $lang</div></td></tr>";
			mysql_close($remotedb);
			continue;
		}
		while ($row = mysql_fetch_array($result))
		{
			$article = $row[0];
			$remotedbarticle = $row[1];
			$dbarticle = title_to_db($article);
			$remotearticle = title_from_db($remotedbarticle);
			if (!array_key_exists($dbarticle, $localarticles))
			{
				$localarticles[$dbarticle] = $lang;

				if ($countmissing == 0)
				{
					echo "<table class='wikitable sortable'>\n";
					echo "<tr><th>Remote</th><th>Local</th></tr>\n";
				}

			    echo "\t<tr>\n";
				echo "\t\t<td><a href='http://" . htmlspecialchars($lang, ENT_QUOTES) . ".wikipedia.org/wiki/Category:" . htmlspecialchars(title_to_db($interwikis[$lang]), ENT_QUOTES) . "'>" . htmlspecialchars($lang) . "</a>:<a href='http://" . htmlspecialchars($lang, ENT_QUOTES) . ".wikipedia.org/wiki/" . htmlspecialchars($remotedbarticle, ENT_QUOTES) . "'>" . htmlspecialchars($remotearticle) . "</td>\n";
				echo "\t\t<td><a href='http://" . htmlspecialchars($homelang, ENT_QUOTES) . ".wikipedia.org/wiki/" . htmlspecialchars($dbarticle, ENT_QUOTES) . "'>" . htmlspecialchars($article) . "</a></td>\n";
				echo "\t</tr>\n";
				flush();

				++$countmissing;
			}
		}
		mysql_close($remotedb);
	}
	unset($lang); unset($cat);

	if ($countmissing == 0)
	{
		echo "<p>Nothing to do... " . count($localarticles) . " articles at home, " . count($interwikis) . " interwikis checked, nothing found</p>";
		return;
	}
	else
	{
		echo "</table>";
	}
}

if ($catname && $project)
{
	execute($catname, $project);
}
?>
</body>
</html>
