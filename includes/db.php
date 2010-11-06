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

function running_on_toolserver()
{
    if (!isset($_SERVER['SERVER_NAME'])) return isset($_SERVER['SSH_CONNECTION']);
    return preg_match("/\btoolserver\.org$/", $_SERVER['SERVER_NAME']) ? true : false;
}

function running_from_shell()
{
    return php_sapi_name() == 'cli' && empty($_SERVER['REMOTE_ADDR']);
}

function connect_to_db($dbname)
{
    if (running_on_toolserver())
    {
		$dbname = str_replace('-', '_', $dbname);
        $toolserver_mycnf = parse_ini_file('/home/' . get_current_user() . '/.my.cnf');
        $db = mysql_connect("$dbname-p.rrdb.toolserver.org", $toolserver_mycnf['user'], $toolserver_mycnf['password']);
        if (!$db) return null;
        if (!mysql_select_db("{$dbname}_p", $db)) return null;
        unset($toolserver_mycnf);
        return $db;
    }
    else
    {
        $db = mysql_connect('127.0.0.1', 'wikiuser', 'wikipass');
        if (!$db) return null;
        if (!mysql_select_db('wikidb', $db)) return null;
        return $db;
    }
}

function get_pageid($db, $ns, $pagetitle)
{
    $query = mysql_query('SELECT page_id FROM page WHERE page_namespace = ' . intval($ns) . ' AND page_title=\'' . mysql_real_escape_string($pagetitle, $db) . '\'', $db);
    if (!$query) return null;
    $result = mysql_fetch_row($query);
    if (!$result) return null;
    return $result[0];
}

function get_last_edit_timestamp($db)
{
    $query = mysql_query('SELECT rc_timestamp FROM recentchanges ORDER BY rc_timestamp DESC LIMIT 1', $db);
    if (!$query) return null;
    $result = mysql_fetch_row($query);
    if (!$result) return null;
    return $result[0];
}

function title_to_db($title)
{
	return str_replace(' ', '_', $title);
}

function title_from_db($title)
{
	return str_replace('_', ' ', $title);
}
