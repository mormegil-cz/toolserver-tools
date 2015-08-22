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

$article = get_variable_or_null('article');
$project = get_variable_or_null('project');

?><!DOCTYPE HTML>
<html>
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <title><?php echo wfMsg('title'); ?></title>
  <link rel="stylesheet" href="//cs.wikipedia.org/w/load.php?debug=false&lang=cs&modules=mediawiki.legacy.shared|mediawiki.sectionAnchor|mediawiki.skinning.interface|mediawiki.ui.button|skins.vector.styles&only=styles&skin=vector&*" media="screen" />
</head>
<body class="mediawiki ltr">
    <h1><?php echo wfMsg('title'); ?></h1>

    <form method="post">
        <table>
            <tr><th><label for="project"><?php echo wfMsg('homelanguage'); ?></label></th><td><input name="project" id="project" maxlength="20" value="<?php echo $project ? htmlspecialchars($project) : $uselang ?>" /></td></tr>
            <tr><th><label for="article"><?php echo wfMsg('article'); ?></label></th><td><input name="article" id="article" maxlength="255" value="<?php echo $article ? htmlspecialchars($article) : '' ?>" /></td></tr>
            <tr><td colspan="2"><input type="submit" value="<?php echo htmlspecialchars(wfMsg('submit'), ENT_QUOTES); ?>" /></td></tr>
        </table>
<?php

function execute($articlename, $homelang, $sourcewiki)
{
    $db = connect_to_db($homelang . 'wiki');
    if (!$db)
    {
        echo "<p class='error'>" . wfMsg('error-db') . "</p>";
        return;
    }

	$remotedb = connect_to_db($sourcewiki . 'wiki');
	if (!$remotedb)
	{
        echo "<p class='error'>" . format_message('error-sourcedb', $sourcewiki) . "</p>";
		return;
	}

	$articlename = title_to_db($articlename);
	$articleurl = str_replace('&', '%26', $articlename);

	echo "<!-- Loading interwiki -->\n";
	flush();
	$query = "SELECT ll_title FROM langlinks INNER JOIN page ON ll_from = page_id WHERE page_title = '" . mysql_real_escape_string($articlename, $db) . "' AND page_namespace = 0 AND ll_lang='" . mysql_real_escape_string($sourcewiki, $db) . "'";
    $queryresult = mysql_query($query, $db);
    if (!$queryresult)
    {
        echo "<p class='error'>" . wfMsg('error-iwquery') . "</p>";
        return;
    }

	$remotearticlename = null;
	if ($row = mysql_fetch_assoc($queryresult))
    {
		$remotearticlename = $row['ll_title'];
	}
	else
	{
        echo "<p class='error'>" . wfMsg('error-missingiw') . "</p>";
		return;
	}

    echo "<!-- Loading local categories -->\n";
	flush();
	$queryresult = mysql_query("SELECT cl_to FROM page INNER JOIN categorylinks ON cl_from = page_id WHERE page_title = '" . mysql_real_escape_string(title_to_db($articlename), $db) . "' AND page_namespace = 0 LIMIT 500", $db);
    if (!$queryresult)
    {
        echo "<p class='error'>" . wfMsg('error-catquery') . "</p>";
        return;
    }

	$localcategories = array();
    while ($row = mysql_fetch_array($queryresult))
    {
		$localcategories[$row[0]] = 1;
	}

	echo "<!-- Starting interwiki processing -->\n";
	flush();
	$countmissing = 0;
	$remotecategories = 0;
	$homewiki = 'http://' . htmlspecialchars($homelang, ENT_QUOTES) . '.wikipedia.org/wiki/';
	$remotewiki = 'http://' . htmlspecialchars($sourcewiki, ENT_QUOTES) . '.wikipedia.org/wiki/';
	$remotearticleurl = $remotewiki . htmlspecialchars(str_replace('?', '%3F', title_to_db($remotearticlename)), ENT_QUOTES);

    /*
    article.page_title => article.page_id
    article.page_id == cl_from => cl_to
    cl_to == category.page_title => category.page_id
    category.page_id == ll_from
    */
    $query = "SELECT ll_title, cl_to FROM page AS artpage INNER JOIN categorylinks ON artpage.page_id = cl_from INNER JOIN page AS catpage ON catpage.page_title = cl_to AND catpage.page_namespace = 14 INNER JOIN langlinks ON catpage.page_id = ll_from AND ll_lang='" . mysql_real_escape_string($homelang, $remotedb) . "' WHERE artpage.page_title = '" . mysql_real_escape_string(title_to_db($remotearticlename), $remotedb) . "' AND artpage.page_namespace = 0 LIMIT 500";
	$result = mysql_query($query, $remotedb);
	if (!$result)
	{
        echo "<p class='error'>" . wfMsg('error-remotequery') . "</p>";
		return;
	}

	echo "<h3><a href='$remotearticleurl'>$sourcewiki:" . htmlspecialchars($remotearticlename) . "</a></h3>";

	while ($row = mysql_fetch_array($result))
	{
		++$remotecategories;
		$categoryfull = $row[0];
		$remotedbcategory = $row[1];

		$colon = strpos($categoryfull, ':');
		if ($colon === FALSE)
		{
			echo "<!-- Bad interwiki: " . htmlspecialchars($categoryfull) . " -->\n";
			continue;
		}
        $categoryname = title_from_db(substr($categoryfull, $colon + 1));
		$dbcategory = title_to_db($categoryname);
		if (!array_key_exists($dbcategory, $localcategories))
		{
			$remotecategory = title_from_db($remotedbcategory);
			$remotecategoryurl = 'Category:' . str_replace('?', '%3F', $remotedbcategory);
			$categoryurl = 'Category:' . str_replace('?', '%3F', $dbcategory);

			if ($countmissing == 0)
			{
				echo "<table class='wikitable sortable'>\n";
				echo "<tr><th>" . wfMsg('header-remote') . "</th><th>" . wfMsg('header-local') . "</th><th>" . wfMsg('header-hotcat') . "</th></tr>\n";
			}

			echo "\t<tr>\n";
			echo "\t\t<td><a href='$remotewiki" . htmlspecialchars($remotecategoryurl, ENT_QUOTES) . "'>" . htmlspecialchars($remotecategory) . "</td>\n";
			echo "\t\t<td>\n";
			echo "\t\t\t<a href='$homewiki" . htmlspecialchars($categoryurl, ENT_QUOTES) . "'>" . htmlspecialchars($categoryname) . "</a>\n";
			echo "\t\t</td>\n";
			echo "\t\t<td>\n";
			echo "\t\t\t(<a href='$homewiki" . htmlspecialchars($articleurl, ENT_QUOTES) . "?action=edit&hotcat_comment=%20(CatSuggest%20via%20[[$sourcewiki:$remotearticlename]])&amp;hotcat_newcat=" . htmlspecialchars($categoryurl, ENT_QUOTES) . "'>+</a>)\n";
			echo "\t\t</td>\n";
			echo "\t</tr>\n";
			flush();

			++$countmissing;
		}
	}

	if ($countmissing == 0)
	{
		echo "<p>" . format_message('nothingtodo', $homelang, count($localcategories), $sourcewiki, $remotecategories) . "</p>";
		return;
	}
	else
	{
		echo "</table>";
	}
}

function sourcewikichoice($articlename, $homelang)
{
    $db = connect_to_db($homelang . 'wiki');
    if (!$db)
    {
        echo "<p class='error'>" . wfMsg('error-db') . "</p>";
        return;
    }

	$articlename = title_to_db($articlename);

	$query = "SELECT ll_lang, ll_title FROM langlinks INNER JOIN page ON ll_from = page_id WHERE page_title = '" . mysql_real_escape_string($articlename, $db) . "' AND page_namespace = 0";
    $queryresult = mysql_query($query, $db);
    if (!$queryresult)
    {
        echo "<p class='error'>" . wfMsg('error-iwquery') . "</p>";
        return;
    }

	$first = true;
	while ($row = mysql_fetch_assoc($queryresult))
    {
		$lang = $row['ll_lang'];
		$title = $row['ll_title'];
		if ($first)
		{
			echo "<h2>" . wfMsg('choosesource') . "</h2>";
			$first = false;
		}
        echo "<input type='submit' name='sourcewiki' value='$lang' />";
		$first = false;
	}

	if ($first)
	{
        echo "<p class='error'>" . wfMsg('error-noiw') . "</p>";
	}
}

if ($article && $project)
{
	$sourcewiki = isset($_POST['sourcewiki']) ? $_POST['sourcewiki'] : null;
	if ($sourcewiki)
	{
		execute($article, $project, $sourcewiki);
	}
	else
	{
		sourcewikichoice($article, $project);
	}
}
?>
    </form>
</body>
</html>
