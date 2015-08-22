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
$subcats = isset($_POST['subcats']) && $_POST['project'];

?><!DOCTYPE HTML>
<html>
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <title>Category without coordinates</title>
  <link rel="stylesheet" href=//en.wikipedia.org/w/load.php?debug=false&lang=en&modules=mediawiki.legacy.shared|mediawiki.sectionAnchor|mediawiki.skinning.interface|mediawiki.ui.button|skins.vector.styles&only=styles&skin=vector&*" media="screen" />
</head>
<body class="mediawiki ltr">
    <h1>Category without coordinates</h1>

    <form method="post">
        <table>
            <tr><th><label for="dbname">Language:</label></th><td><input name="project" id="project" maxlength="20" value="<?php echo $project ? htmlspecialchars($project) : '' ?>" /></td></tr>
            <tr><th><label for="dbname">Category:</label></th><td><input name="catname" id="catname" maxlength="255" value="<?php echo $catname ? htmlspecialchars($catname) : '' ?>" /></td></tr>
            <tr><th colspan="2"><input type="checkbox" name="subcats" id="subcats" <?php if ($subcats) echo 'checked="checked"' ?> /><label for="subcats">Check subcategories</label</td></tr>
            <tr><td colspan="2"><input type="submit" value="Go!" /></td></tr>
        </table>
    </form>

<?php

function execute($catname, $project, $subcats)
{
    $db = connect_to_db($project . 'wiki');
    if (!$db)
    {
        echo '<p class="error">Error connecting to database</p>';
        return;
    }

	$catname = title_to_db($catname);

	$query = 'select p.page_title from page p inner join categorylinks cl0 on cl0.cl_from=p.page_id ';

	if ($subcats)
	{
		$query .= "inner join page pc0 on pc0.page_namespace=14 and pc0.page_title=cl0.cl_to inner join categorylinks cl1 on cl1.cl_from=pc0.page_id where cl1";
	}
	else
	{
		$query .= 'where cl0';
	}
	$query .= ".cl_to='" . mysql_real_escape_string($catname) . "' and p.page_namespace=0 and not exists (select el_from from externallinks where el_from=p.page_id and el_to like 'http://toolserver.org/~geohack/%') limit 1000";

    $queryresult = mysql_query($query, $db);
    if (!$queryresult)
    {
        echo '<p class="error">Error executing query: ' . htmlspecialchars(mysql_error()) . '</p>';
        return;
    }

	$count = 0;
	while ($row = mysql_fetch_array($queryresult))
	{
		$article = $row[0];

		if ($count == 0)
		{
			echo "<ul>\n";
		}
		++$count;

		echo '<li><a href="http://' . htmlspecialchars($project, ENT_QUOTES) . '.wikipedia.org/wiki/' . htmlspecialchars($article, ENT_QUOTES) . '">' . htmlspecialchars(title_from_db($article), ENT_QUOTES) . "</li>\n";
	}

	if ($count == 0)
	{
		echo "<p>Nothing found</p>";
	}
	else
	{
		echo "</ul>";
		if ($count == 1000) echo '<p class="warning">Too many results, listing might be incomplete</p>';
	}
}

if ($catname && $project)
{
	execute($catname, $project, $subcats);
}
?>
</body>
</html>
