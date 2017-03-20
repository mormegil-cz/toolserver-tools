<?php
/*
    Copyright © 2014 Petr Kadlec <mormegil@centrum.cz>

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

define('MAX_COUNT', 5000);

$NAMESPACES = array(
    '',
    'Talk:',
    'User:',
    'User_talk:',
    'Project:',
    'Project_talk:',
    'File:',
    'File_talk:',
    'MediaWiki:',
    'MediaWiki_talk:',
    'Template:',
    'Template_talk:',
    'Help:',
    'Help_talk:',
    'Category:',
    'Category_talk:'
);

$count = get_variable_or_null('count');
$project = get_variable_or_null('project');
$namespace = get_variable_or_null('namespace');
$redirects = get_variable_or_null('redirects');
$outformat = get_variable_or_null('outformat');
if (!$project) $project = 'cs';
if ($namespace) $namespace = intval($namespace);
if (!$namespace || $namespace < 0 || $namespace>65535) $namespace = 0;
if ($count) $count = intval($count);
if (!$count || $count < 0) $count = 10;
else if ($count > MAX_COUNT) $count = MAX_COUNT;

if ($count && $project && $_SERVER['REQUEST_METHOD'] == 'POST')
{
	execute($count, $project, $namespace, $redirects, $outformat);
}
else
{
    html_header($count, $project, $namespace, $redirects, $outformat);
    html_footer();
}

function html_header($count, $project, $namespace, $redirects, $outformat)
{
?>
<!DOCTYPE HTML>
<html>
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <title><?php echo wfMsg('title'); ?></title>
</head>
<body>
    <h1><?php echo wfMsg('title'); ?></h1>

    <form method="post">
        <table>
            <tr><th><label for="dbname"><?php echo wfMsg('project'); ?></label></th><td><input name="project" id="project" maxlength="20" value="<?php echo $project ? htmlspecialchars($project) : $uselang ?>" /></td></tr>
            <tr><th><label for="count"><?php echo wfMsg('count'); ?></label></th><td><input name="count" id="count" maxlength="4" type="number" min="1" max="<?php echo MAX_COUNT; ?>" value="<?php echo $count ? htmlspecialchars($count) : '' ?>" /></td></tr>
            <tr><th><label for="namespace"><?php echo wfMsg('namespace'); ?></label></th><td><input name="namespace" id="namespace" maxlength="5" min="0" max="15" value="<?php echo htmlspecialchars($namespace) ?>" /></td></tr>
            <tr><th><label><?php echo wfMsg('redirects'); ?></label></th><td>
                <input name="redirects" id="redirects-none" type="radio" value="" <?php if ($redirects!='all' && $redirects!='only') echo 'checked="checked"'; ?> /><label for="redirects-none"><?php echo wfMsg('redirects-none'); ?></label>
                <input name="redirects" id="redirects-all" type="radio" value="all" <?php if ($redirects=='all') echo 'checked="checked"'; ?> /><label for="redirects-all"><?php echo wfMsg('redirects-all'); ?></label>
                <input name="redirects" id="redirects-only" type="radio" value="only" <?php if ($redirects=='only') echo 'checked="checked"'; ?> /><label for="redirects-only"><?php echo wfMsg('redirects-only'); ?></label>
            </td></tr>
            <tr><th><label><?php echo wfMsg('outformat'); ?></label></th><td>
                <input name="outformat" id="outformat-table" type="radio" value="table" <?php if ($outformat!='txt') echo 'checked="checked"'; ?> /><label for="outformat-table"><?php echo wfMsg('outformat-table'); ?></label>
                <input name="outformat" id="outformat-txt" type="radio" value="txt" <?php if ($outformat=='txt') echo 'checked="checked"'; ?> /><label for="outformat-txt"><?php echo wfMsg('outformat-txt'); ?></label>
            </td></tr>
            <tr><td colspan="2"><input type="submit" value="<?php echo htmlspecialchars(wfMsg('submit'), ENT_QUOTES); ?>" /></td></tr>
        </table>
    </form>

<?php
}

function html_footer()
{
?>
</body>
</html>
<?php
}

function wfRandom() {
	# The maximum random value is "only" 2^31-1, so get two random
	# values to reduce the chance of dupes
	$max = mt_getrandmax() + 1;
	$rand = number_format( ( mt_rand() * $max + mt_rand() ) / $max / $max, 12, '.', '' );

	return $rand;
}

function build_sql($namespace, $redirects, $random)
{
	$query = 'SELECT page_namespace, page_title, page_is_redirect FROM page WHERE page_namespace=' . intval($namespace);
    switch($redirects)
    {
        case 'all':
            break;
        case 'only':
            $query .= ' AND page_is_redirect=1';
            break;
        default:
            $query .= ' AND page_is_redirect=0';
            break;
    }
    $query .= " AND page_random >= $random ORDER BY page_random LIMIT 1";
    return $query;
}

function fetch_random($db, $namespace, $redirects)
{
    $query = build_sql($namespace, $redirects, wfRandom());
    $queryresult = mysql_query($query, $db);
    if (!$queryresult) return null;
    $row = mysql_fetch_row($queryresult);
    if ($row) return $row;

    $query = build_sql($namespace, $redirects, '0');
    $queryresult = mysql_query($query, $db);
    if (!$queryresult) return null;
    $row = mysql_fetch_row($queryresult);
    return $row;
}

function execute($count, $project, $namespace, $redirects, $outformat)
{
    global $NAMESPACES;

    $db = connect_to_db($project . 'wiki');
    if (!$db)
    {
        html_header($count, $project, $namespace, $redirects, $outformat);
        echo "<p class='error'>" . wfMsg('error-db') . "</p>";
        html_footer();
        return;
    }

    switch ($outformat)
    {
        case 'txt':
            header('Content-type: text/plain; charset=UTF-8');
            break;

        default:
            html_header($count, $project, $namespace, $redirects, $outformat);
            echo '<h3>' . wfMsg('heading-results') . '</h3>';
            echo '<table><tr><th>' . wfMsg('header-index') . '</th><th>' . wfMsg('header-page') . "</th></tr>\n";
            break;
    }
    
    for ($i = 0; $i < $count; ++$i)
    {
        $randomrow = fetch_random($db, $namespace, $redirects);
        if ($randomrow)
        {
            $ns = intval($randomrow[0]);
            $title = $randomrow[1];
            $isredir = intval($randomrow[2]) !== 0;
            $nsname = $NAMESPACES[$ns];
            $dbname = $nsname . $title;
            $humanname = str_replace('_', ' ', $dbname);
            if ($outformat == 'table')
            {
                echo '<tr><th>';
                echo $i+1;
                echo '</th><td><a href="//';
                echo htmlspecialchars($project, ENT_QUOTES);
                echo '.wikipedia.org/wiki/';
                echo htmlspecialchars($dbname, ENT_QUOTES);
                if ($isredir) echo '?redirect=no';
                echo '">';
                echo htmlspecialchars($humanname);
                echo "</a></td></tr>\n";
            }
            else
            {
                echo "$humanname\n";
            }
        }
    }

    if ($outformat == 'table')
    {
        echo '</table>';
        html_footer();
    }
}
