<!DOCTYPE HTML>
<html>
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <title>Wikipedia Biographical Articles Counter</title>
  <meta name="author" content="Petr Kadlec &lt;http://cs.wikipedia.org/wiki/User:Mormegil&gt;" />
</head>
<body lang="en">

    <h1>Wikipedia Biographical Articles Counter</h1>

    <form action='nblist.php' method='get'>
        <table>
            <tr>
                <td><label for="project">Project:</label></td>
                <td>
                    <select name="project" id="project">
<?php
require_once(dirname( __FILE__ ) . '/catnames.php');

foreach($birthcatname as $project => $n)
{
    echo "                      <option value='$project'>$project</option>\n";
}
?>
                    </select>
                </td>
            </tr>
            <tr>
                <td><label for='separator'>CSV field separator:</label></td>
                <td><input type='text' name='separator' id='separator' value=',' size='1' /></td>
            </tr>
            <tr><td colspan="2"><input type='submit' value='Download' /></td></tr>
        </table>
    </form>
</body>
</html>
