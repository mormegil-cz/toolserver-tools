<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8" />
    <title>Kemler code interpreter</title>
    <link rel="stylesheet" href="kemlercode.css" />
</head>

<body>
<?php

const SPECIAL_CODES = array(
    '22' => 1,
    '323' => 1,
    '333' => 1,
    '362' => 1,
    '382' => 1,
    '423' => 1,
    '44' => 1,
    '446' => 1,
    '462' => 1,
    '482' => 1,
    '539' => 1,
    '606' => 1,
    '623' => 1,
    '642' => 1,
    '823' => 1,
    '842' => 1,
    '90' => 1,
    '99' => 1
);

const DEFINITIONS = array(
    '20' => 'asphyxiant gas or gas with no subsidiary risk',
    '22' => 'refrigerated liquefied gas, asphyxiant',
    '223' => 'refrigerated liquefied gas, flammable',
    '225' => 'refrigerated liquefied gas, oxidizing (fire-intensifying)',
    '23' => 'flammable gas',
    '239' => 'flammable gas, which can spontaneously lead to violent reaction',
    '25' => 'oxidizing (fire-intensifying) gas',
    '26' => 'toxic gas',
    '263' => 'toxic gas, flammable',
    '265' => 'toxic gas, oxidizing (fire-intensifying)',
    '268' => 'toxic gas, corrosive',
    '30' => 'flammable liquid (flash-point between 23 °C and 60 °C, inclusive) or flammable liquid or solid in the molten state with a flash-point above 60 °C, heated to a temperature equal to or above its flash-point, or self-heating liquid',
    '323' => 'flammable liquid which reacts with water, emitting flammable gases',
    'X323' => 'flammable liquid which reacts dangerously with water, emitting flammable gases [Water not to be used except by approval of experts.]',
    '33' => 'highly flammable liquid (flash-point below 23 °C)',
    '333' => 'pyrophoric liquid',
    'X333' => 'pyrophoric liquid which reacts dangerously with water [Water not to be used except by approval of experts.]',
    '336' => 'highly flammable liquid, toxic',
    '338' => 'highly flammable liquid, corrosive',
    'X338' => 'highly flammable liquid, corrosive, which reacts dangerously with water [Water not to be used except by approval of experts.]',
    '339' => 'highly flammable liquid which can spontaneously lead to violent reaction',
    '36' => 'flammable liquid (flash-point between 23 °C and 60 °C, inclusive), slightly toxic, or self-heating liquid, toxic',
    '362' => 'flammable liquid, toxic, which reacts with water, emitting flammable gases',
    'X362' => 'flammable liquid toxic, which reacts dangerously with water, emitting flammable gases [Water not to be used except by approval of experts.]',
    '368' => 'flammable liquid, toxic, corrosive',
    '38' => 'flammable liquid (flash-point between 23 °C and 60 °C, inclusive), slightly corrosive or self-heating liquid, corrosive',
    '382' => 'flammable liquid, corrosive, which reacts with water, emitting flammable gases',
    'X382' => 'flammable liquid, corrosive, which reacts dangerously with water, emitting flammable gases [Water not to be used except by approval of experts.]',
    '39' => 'flammable liquid, which can spontaneously lead to violent reaction',
    '40' => 'flammable solid, or self-reactive substance, or self-heating substance',
    '423' => 'solid which reacts with water, emitting flammable gases, or flammable solid which reacts with water, emitting flammable gases or self-heating solid which reacts with water, emitting flammable gases',
    'X423' => 'solid which reacts dangerously with water, emitting flammable gases, or flammable solid which reacts dangerously with water, emitting flammable gases, or self-heating solid which reacts dangerously with water, emitting flammable gases [Water not to be used except by approval of experts.]',
    '43' => 'spontaneously flammable (pyrophoric) solid',
    'X432' => 'spontaneously flammable (pyrophoric) solid which reacts dangerously with water, emitting flammable gases [Water not to be used except by approval of experts.]',
    '44' => 'flammable solid, in the molten state at an elevated temperature',
    '446' => 'flammable solid, toxic, in the molten state, at an elevated temperature',
    '46' => 'flammable or self-heating solid, toxic',
    '462' => 'toxic solid which reacts with water, emitting flammable gases',
    'X462' => 'solid which reacts dangerously with water, emitting toxic gases [Water not to be used except by approval of experts.]',
    '48' => 'flammable or self-heating solid, corrosive',
    '482' => 'corrosive solid which reacts with water, emitting flammable gases',
    'X482' => 'solid which reacts dangerously with water, emitting corrosive gases [Water not to be used except by approval of experts.]',
    '50' => 'oxidizing (fire-intensifying) substance',
    '539' => 'flammable organic peroxide',
    '55' => 'strongly oxidizing (fire-intensifying) substance',
    '556' => 'strongly oxidizing (fire-intensifying) substance, toxic',
    '558' => 'strongly oxidizing (fire-intensifying) substance, corrosive',
    '559' => 'strongly oxidizing (fire-intensifying) substance, which can spontaneously lead to violent reaction',
    '56' => 'oxidizing substance (fire-intensifying), toxic',
    '568' => 'oxidizing substance (fire-intensifying), toxic, corrosive',
    '58' => 'oxidizing substance (fire-intensifying), corrosive',
    '59' => 'oxidizing substance (fire-intensifying) which can spontaneously lead to violent reaction',
    '60' => 'toxic or slightly toxic substance',
    '606' => 'infectious substance',
    '623' => 'toxic liquid, which reacts with water, emitting flammable gases',
    '63' => 'toxic substance, flammable (flash-point between 23 °C and 60 °C, inclusive)',
    '638' => 'toxic substance, flammable (flash-point between 23 °C and 60 °C, inclusive), corrosive',
    '639' => 'toxic substance, flammable (flash-point not above 60 °C) which can spontaneously lead to violent reaction',
    '64' => 'toxic solid, flammable or self-heating',
    '642' => 'toxic solid, which reacts with water, emitting flammable gases',
    '65' => 'toxic substance, oxidizing (fire-intensifying)',
    '66' => 'highly toxic substance',
    '663' => 'highly toxic substance, flammable (flash-point not above 60 °C)',
    '664' => 'highly toxic solid, flammable or self-heating',
    '665' => 'highly toxic substance, oxidizing (fire-intensifying)',
    '668' => 'highly toxic substance, corrosive',
    'X668' => 'highly toxic substance, corrosive, which reacts dangerously with water [Water not to be used except by approval of experts.]',
    '669' => 'highly toxic substance which can spontaneously lead to violent reaction',
    '68' => 'toxic substance, corrosive',
    '69' => 'toxic or slightly toxic substance, which can spontaneously lead to violent reaction',
    '70' => 'radioactive material',
    '78' => 'radioactive material, corrosive',
    '80' => 'corrosive or slightly corrosive substance',
    'X80' => 'corrosive or slightly corrosive substance, which reacts dangerously with water [Water not to be used except by approval of experts.]',
    '823' => 'corrosive liquid which reacts with water, emitting flammable gases',
    '83' => 'corrosive or slightly corrosive substance, flammable (flash-point between 23 °C and 60 °C, inclusive)',
    'X83' => 'corrosive or slightly corrosive substance, flammable, (flash-point between 23 °C and 60 °C, inclusive), which reacts dangerously with water [Water not to be used except by approval of experts.]',
    '839' => 'corrosive or slightly corrosive substance, flammable (flash-point between 23 °C and 60 °C inclusive) which can spontaneously lead to violent reaction',
    'X839' => 'corrosive or slightly corrosive substance, flammable (flash-point between 23 °C and 60 °C inclusive), which can spontaneously lead to violent reaction and which reacts dangerously with water [Water not to be used except by approval of experts.]',
    '84' => 'corrosive solid, flammable or self-heating',
    '842' => 'corrosive solid which reacts with water, emitting flammable gases',
    '85' => 'corrosive or slightly corrosive substance, oxidizing (fire-intensifying)',
    '856' => 'corrosive or slightly corrosive substance, oxidizing (fire-intensifying) and toxic',
    '86' => 'corrosive or slightly corrosive substance, toxic',
    '88' => 'highly corrosive substance',
    'X88' => 'highly corrosive substance, which reacts dangerously with water [Water not to be used except by approval of experts.]',
    '883' => 'highly corrosive substance, flammable (flash-point between 23 °C and 60 °C inclusive)',
    '884' => 'highly corrosive solid, flammable or self-heating',
    '885' => 'highly corrosive substance, oxidizing (fire-intensifying)',
    '886' => 'highly corrosive substance, toxic',
    'X886' => 'highly corrosive substance, toxic, which reacts dangerously with water [Water not to be used except by approval of experts.]',
    '89' => 'corrosive or slightly corrosive substance, which can spontaneously lead to violent reaction',
    '90' => 'environmentally hazardous substance; miscellaneous dangerous substances',
    '99' => 'miscellaneous dangerous substance carried at an elevated temperature'
);

function showDecode($code) {
    if (!preg_match('/^X?[2-9][02-9][2-9]?$/', $code)) {
        showForm('The supplied code is not a valid hazard identification code.');
        return;
    }

    if (isset(DEFINITIONS[$code])) {
        $meaning = DEFINITIONS[$code];
        $specialMeaning = isset(SPECIAL_CODES[$code]);
    } else {
        $meaning = null;
        $specialMeaning = false;
    }
    
?>
    <svg xmlns="http://www.w3.org/2000/svg" version="1.0" width="400" height="300">
        <path d="M 392.5,7.5 L 7.5,7.5 L 7.5,292.5 L 392.5,292.5 L 392.5,7.5 z" />
        <path d="M 0,150 l 400,0" />
        <text x="200" y="110"><?=$code?></text>
    </svg>
    <h1>Kemler code interpreter</h1>
<?php
    if ($meaning) {
?>
    <p>Hazard identification code <code><?=$code?></code> means<sup><a href="https://unece.org/fileadmin/DAM/trans/danger/publi/adr/adr2011/English/VolumeII.pdf#page=279">[1]</a></sup></p>
    <blockquote>
        <p><?=$meaning?></p>
    </blockquote>
<?php
    } else {
        echo "<p>Hazard identification code <code>$code</code> is not specifically defined.<sup><a href='https://unece.org/fileadmin/DAM/trans/danger/publi/adr/adr2011/English/VolumeII.pdf#page=279'>[1]</a></sup></p>\n";
    }

    if ($specialMeaning) {
        echo "<p>This specific combination is defined to have a special meaning. Otherwise, the individual characters would have the following meaning:</p>\n";
    } else {
        echo "<p>The individual characters refer to:</p>";
    }
?>
    <dl>
<?php
    $len = strlen($code);
    $prev = '_';
    for ($i = 0; $i < $len; ++$i) {
        $ch = $code[$i];
        if ($ch === '0') continue;
        echo "<dt>$ch</dt><dd>";
        if ($ch === $prev) {
            echo 'Doubling of a figure indicates an intensification of that particular hazard.';
        }
        else {
            switch($ch) {
                case 'X':
                    echo 'The substance will react dangerously with water. Water may only be used by approval of experts.';
                    break;
                case '2':
                    echo 'Emission of gas due to pressure or to chemical reaction';
                    break;
                case '3':
                    echo 'Flammability of liquids (vapours) and gases or self-heating liquid';
                    break;
                case '4':
                    echo 'Flammability of solids or self-heating solid';
                    break;
                case '5':
                    echo 'Oxidizing (fire-intensifying) effect';
                    break;
                case '6':
                    echo 'Toxicity or risk of infection';
                    break;
                case '7':
                    echo 'Radioactivity';
                    break;
                case '8':
                    echo 'Corrosivity';
                    break;
                case '9':
                    echo 'Risk of spontaneous violent reaction. <i>Note:</i> The risk of spontaneous violent reaction include the possibility following from the nature of a substance of a risk of explosion, disintegration and polymerization reaction following the release of considerable heat or flammable and/or toxic gases.';
                    break;
            }
        }
        echo "</dd>\n";
        $prev = $ch;
    }
?>
    </dl>

    <h3>Links</h3>
    <ul>
        <li><a href="https://en.wikipedia.org/wiki/ADR_(treaty)">ADR treaty on Wikipedia</a></li>
        <li><a href="https://www.wikidata.org/wiki/Q905863">Kemler code on Wikidata</a>, <a href="https://www.wikidata.org/wiki/Property:P700">property P700</a></li>
        <li><a href="https://query.wikidata.org/embed.html#SELECT%20%3Fitem%20%3FitemLabel%20WHERE%20%7B%20%3Fitem%20wdt%3AP700%20%27<?=$code?>%27.%20SERVICE%20wikibase%3Alabel%20%7B%20bd%3AserviceParam%20wikibase%3Alanguage%20%22%5BAUTO_LANGUAGE%5D%2Cen%22.%20%7D%20%7D">List of items with Kemler code <code><?=$code?></code> on Wikidata</a></li>
    </ul>
<?php
}

function showForm($errmsg) {
?>
    <h1>Kemler code interpreter</h1>
<?php
    if ($errmsg) {
        echo "<p class='error'>$errmsg</p>\n";
    }
?>
    <form>
        <div>
            <label for="code">Kemler code:</label>
            <input id="code" name="code" /><br />
            <input type="submit" />
        </div>
    </form>
<?php
}

if (isset($_GET['code'])) {
    showDecode($_GET['code']);
} else {
    showForm('');
}

?>
</body>

</html>