<!DOCTYPE HTML>
<html>
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <title>Mormegil’s Tools</title>
  <meta name="author" content="Petr Kadlec &lt;http://cs.wikipedia.org/wiki/User:Mormegil&gt;" />
</head>
<body>
	<h1>Mormegil’s Tools</h1>
	<ul>
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

	$dh = opendir('.');
	while (($file = readdir($dh)) !== false) {
		if ($file[0] != '.' && is_dir($file) && file_exists($file . '/index.php'))
		{
			echo "<li><a href='$file/'>$file</a></li>\n";
		}
    }

?>
	</ul>
</body>
</html>
