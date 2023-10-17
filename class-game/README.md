About Wikidata Class Game
=========================

This is a simple abstract game for people interested in (and well-versed in) [Wikidata](https://www.wikidata.org) class hierarchy.

### How to play

Your goal is to figure which _class_ (existing as a Wikidata item) was chosen by random at the beginning of a game, in as few guesses as possible. On the screen, the mysterious class is displayed as a red oval with “?” and an arrow to a blue oval with “entity” which represents [the root of Wikidata class tree](https://www.wikidata.org/wiki/Q35120). The arrow shows that the mysterious class is a (transitive) subclass of the root entity (as are all entities in the tree).

You play by adding guesses: by writing into the edit field at the top, you are offered corresponding classes existing on Wikidata (in parentheses, all direct superclasses of each class are shown, which should help to disambiguate possibly multiple classes with the same label). By clicking on an offered class (or by selecting using arrows and pressing ENTER), the class is added into the graph to its proper place, together with a class which shows where the selected class diverges from the mysterious class in its path to the root class. Again, all arrows show the transitive subclass hierarchy. So, all guesses should help you narrow down the seeked class.

When your guess happens to be the mysterious class, you win the game. Note there is no competition nor scoreboard. You are playing against yourself, to understand the Wikidata class hierarchy better, and maybe to find (and possibly improve!) its darker corners.

### Other controls

In addition to the main text input box, there are some other, less important, controls:

*   _About_ – shows this dialog
*   _New game_ – starts a new game (if a game is in progress, it will tell you the mysterious class you failed to find)
*   _Hint_ – adds a class to the graph which might help you
*   _\*ab\*_ – if you check this box, the text input box will search in the whole class names (and the list of their superclasses), not only from the beginning

Also, by clicking on a class in the graph (except the mysterious class, obviously), its Wikidata entity page will open. You can rearrange the classes in the graph a bit by dragging them. Using the mouse wheel, you can zoom in or out.

### Data

The data come (obviously) from Wikidata (and are [CC0-licensed](https://creativecommons.org/publicdomain/zero/1.0/)). Specifically, 5000 most often linked Wikidata items were taken and filtered on those items which are classes. This means some _important_ but not very much _linked_ classes are missing (e.g. [chemical element](https://www.wikidata.org/wiki/Q11344) is definitely an important class, but as there are only about a hundred elements, this class did not make it into the selection), while other not that important classes may be present if they are used a lot (e.g. [Wikimedia KML file](https://www.wikidata.org/wiki/Q26267864) or [source known to be unreliable](https://www.wikidata.org/wiki/Q22979588)).

### Inspiration

The game was inspired by [Metazooa](https://metazooa.com/) which works with the same basic principle but is focused on animal taxonomy.
