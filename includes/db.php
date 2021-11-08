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
    return preg_match("/wmflabs\.org$|tools-webgrid-|\.toolforge.org$/", $_SERVER['SERVER_NAME']) ? true : false;
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
        $toolserver_mycnf = parse_ini_file(__DIR__ . '/../../replica.my.cnf');
        $db = mysqli_connect("$dbname.web.db.svc.wikimedia.cloud", $toolserver_mycnf['user'], $toolserver_mycnf['password'], "{$dbname}_p");
        if (!$db) return null;
        unset($toolserver_mycnf);
        return $db;
    }
    else
    {
        $db = mysqli_connect('127.0.0.1', 'wikiuser', 'wikipass', 'wikidb');
        if (!$db) return null;
        return $db;
    }
}

function get_pageid($db, $ns, $pagetitle)
{
    $query = mysqli_query($db, 'SELECT page_id FROM page WHERE page_namespace = ' . intval($ns) . ' AND page_title=\'' . mysqli_real_escape_string($db, $pagetitle) . '\'');
    if (!$query) return null;
    $result = mysqli_fetch_row($query);
    if (!$result) {
        mysqli_free_result($query);
        return null;
    }
    mysqli_free_result($query);
    return $result[0];
}

function get_last_edit_timestamp($db)
{
    $query = mysqli_query($db, 'SELECT rc_timestamp FROM recentchanges ORDER BY rc_timestamp DESC LIMIT 1');
    if (!$query) return null;
    $result = mysqli_fetch_row($query);
    if (!$result) {
        mysqli_free_result($query);
        return null;
    }
    mysqli_free_result($query);
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
