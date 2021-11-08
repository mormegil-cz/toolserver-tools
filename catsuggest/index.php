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

define('SUGGESTION_COUNT', 0);
define('SUGGESTION_COUNT_HIDDEN', 1);
define('SUGGESTION_REMOTES', 2);

define('REMOTE_CATEGORY', 0);
define('REMOTE_ISHIDDEN', 1);

function catsuggest_compare($a, $b)
{
    if ($a[SUGGESTION_COUNT] === $b[SUGGESTION_COUNT])
        return $b[SUGGESTION_COUNT_HIDDEN] - $a[SUGGESTION_COUNT_HIDDEN];
    else
        return $b[SUGGESTION_COUNT] - $a[SUGGESTION_COUNT];
}

function execute($articlename, $homelang)
{
    $db = connect_to_db($homelang . 'wiki');
    if (!$db)
    {
        echo "<p class='error'>" . wfMsg('error-db') . "</p>";
        return;
    }

    $articlename = title_to_db($articlename);
    $articleurl = str_replace('&', '%26', $articlename);

    echo "<!-- Loading interwiki -->\n";
    flush();
    $query = "SELECT ll_lang, ll_title FROM langlinks INNER JOIN page ON ll_from = page_id WHERE page_title = '" . mysqli_real_escape_string($db, $articlename) . "' AND page_namespace = 0";
    $queryresult = mysqli_query($db, $query);
    if (!$queryresult)
    {
        echo "<p class='error'>" . wfMsg('error-iwquery') . "</p>";
        return;
    }

    $remotearticlenames = array();
    while ($row = mysqli_fetch_assoc($queryresult))
    {
        $remotearticlenames[$row['ll_lang']] = $row['ll_title'];
    }
    mysqli_free_result($queryresult);
    if (!count($remotearticlenames)) {
        echo "<p class='error'>" . wfMsg('error-noiw') . "</p>";
        return;
    }

    echo "<!-- Loading local categories -->\n";
    flush();
    $queryresult = mysqli_query($db, "SELECT cl_to FROM page INNER JOIN categorylinks ON cl_from = page_id WHERE page_title = '" . mysqli_real_escape_string($db, title_to_db($articlename)) . "' AND page_namespace = 0 LIMIT 500");
    if (!$queryresult)
    {
        echo "<p class='error'>" . wfMsg('error-catquery') . "</p>";
        return;
    }

    $localcategories = array();
    while ($row = mysqli_fetch_array($queryresult))
    {
        $localcategories[$row[0]] = 1;
    }
    mysqli_free_result($queryresult);

    echo "<!-- Starting interwiki processing -->\n";
    flush();

    $homewiki = 'http://' . htmlspecialchars($homelang, ENT_QUOTES) . '.wikipedia.org/wiki/';

    $suggestions = array();
    foreach($remotearticlenames as $sourcewiki => $remotearticlename)
    {
        echo "<!-- " . htmlspecialchars($sourcewiki) . " -->\n";

        $remotedb = connect_to_db($sourcewiki . 'wiki');
        if (!$remotedb)
        {
            echo "<p class='error'>" . format_message('error-sourcedb', $sourcewiki) . "</p>";
            continue;
        }

        /*
        article.page_title => article.page_id
        article.page_id == cl_from => cl_to
        cl_to == category.page_title => category.page_id
        category.page_id == ll_from
        + pp_propname=='hiddencat' AND category.page_id=pp_page
        */
        $query = "SELECT ll_title, cl_to, pp_page FROM page AS artpage INNER JOIN categorylinks ON artpage.page_id = cl_from INNER JOIN page AS catpage ON catpage.page_title = cl_to AND catpage.page_namespace = 14 INNER JOIN langlinks ON catpage.page_id = ll_from AND ll_lang='" . mysqli_real_escape_string($remotedb, $homelang) . "' LEFT JOIN page_props ON catpage.page_id=pp_page AND pp_propname='hiddencat' WHERE artpage.page_title = '" . mysqli_real_escape_string($remotedb, title_to_db($remotearticlename)) . "' AND artpage.page_namespace = 0 LIMIT 500";
        $result = mysqli_query($remotedb, $query);
        if (!$result)
        {
            echo "<p class='error'>" . format_message('error-remotequery', $sourcewiki) . "</p>";
            continue;
        }

        // echo "<h3><a href='$remotearticleurl'>$sourcewiki:" . htmlspecialchars($remotearticlename) . "</a></h3>";

        while ($row = mysqli_fetch_array($result))
        {
            $categoryfull = $row[0];
            $remotedbcategory = $row[1];
            $ishidden = $row[2];

            $colon = strpos($categoryfull, ':');
            if ($colon === FALSE)
            {
                echo "<!-- Bad interwiki: " . htmlspecialchars($categoryfull) . " -->\n";
                continue;
            }
            $categoryname = title_from_db(substr($categoryfull, $colon + 1));

            if (array_key_exists($categoryname, $suggestions))
            {
                $entry = $suggestions[$categoryname];
            }
            else
            {
                $entry = array();
                $entry[SUGGESTION_COUNT] = 0;
                $entry[SUGGESTION_COUNT_HIDDEN] = 0;
                $entry[SUGGESTION_REMOTES] = array();
            }

            if ($ishidden) $entry[SUGGESTION_COUNT_HIDDEN] += 1;
            else $entry[SUGGESTION_COUNT] += 1;

            $entry[SUGGESTION_REMOTES][$sourcewiki] = array($remotedbcategory, $ishidden);
            $suggestions[$categoryname] = $entry;
        }
        mysqli_free_result($result);

        mysqli_close($remotedb);
    }

    uasort($suggestions, "catsuggest_compare");

    $countmissing = 0;
    foreach($suggestions as $categoryname => $catdata)
    {
        $dbcategory = title_to_db($categoryname);
        if (!array_key_exists($dbcategory, $localcategories))
        {
            $categoryurl = 'Category:' . str_replace('?', '%3F', $dbcategory);

            if ($countmissing == 0)
            {
                echo "<table id='suggestions' class='wikitable sortable'>\n";
                echo "<thead>\n";
                echo "<tr class='header'><th>" . wfMsg('header-local') . "</th><th>" . wfMsg('header-remote') . "</th><th>" . wfMsg('header-hotcat') . "</th></tr>\n";
                echo "</thead>\n";
                echo "<tbody>\n";
            }

            echo "\t<tr>\n";
            echo "\t\t<td>\n";
            echo "\t\t\t<a href='$homewiki" . htmlspecialchars($categoryurl, ENT_QUOTES) . "'>" . htmlspecialchars($categoryname) . "</a>\n";
            echo "\t\t</td>\n";

            echo "\t\t<td>\n";
            foreach($catdata[SUGGESTION_REMOTES] as $sourcewiki => $remoteinfo)
            {
                $remotedbcategory = $remoteinfo[REMOTE_CATEGORY];
                $ishidden = $remoteinfo[REMOTE_ISHIDDEN];

                $remotewiki = 'http://' . htmlspecialchars($sourcewiki, ENT_QUOTES) . '.wikipedia.org/wiki/';
                // $remotearticleurl = $remotewiki . htmlspecialchars(str_replace('?', '%3F', title_to_db($remotearticlename)), ENT_QUOTES);

                $remotecategory = title_from_db($remotedbcategory);
                $remotecategoryurl = 'Category:' . str_replace('?', '%3F', $remotedbcategory);

                echo "\t\t\t";
                if ($ishidden) echo "<s>";
                echo "<a href='$remotewiki" . htmlspecialchars($remotecategoryurl, ENT_QUOTES) . "' title='" . htmlspecialchars($remotecategory) . "'>" . htmlspecialchars($sourcewiki) . "</a>";
                if ($ishidden) echo "</s>";
                echo "\n";
            }
            echo "\t\t</td>\n";

            // echo "\t\t<td><a href='$remotewiki" . htmlspecialchars($remotecategoryurl, ENT_QUOTES) . "'>" . htmlspecialchars($remotecategory) . "</td>\n";

            echo "\t\t<td>\n";
            echo "\t\t\t(<a href='$homewiki" . htmlspecialchars($articleurl, ENT_QUOTES) . "?action=edit&hotcat_comment=%20(via CatSuggest)&amp;hotcat_newcat=" . htmlspecialchars($categoryurl, ENT_QUOTES) . "'>+</a>)\n";
            echo "\t\t</td>\n";
            echo "\t</tr>\n";
            flush();

            ++$countmissing;
        }
    }

    if ($countmissing == 0)
    {
        echo "<p>" . format_message('nothingtodo') . "</p>";
        return;
    }
    else
    {
        echo "</tbody>\n";
        echo "</table>";
        echo "<div id='scratchspace'></div>";
    }
}

if ($article && $project && $_SERVER['REQUEST_METHOD'] === 'POST')
{
    execute($article, $project);
}
?>
    </form>
    <script src="//en.wikipedia.org/w/load.php?debug=false&lang=en&modules=jquery&only=scripts&skin=vector"></script>
    <script>
    window['uiMessages'] = { categoryns: '<?php
    // TODO: Fix this hack
    echo $project === 'cs' ? 'Kategorie' : 'Category';
    ?>', copy: '<?php echo wfMsg('copy'); ?>' };
    </script>
    <script src="script.js"></script>
</body>
</html>
