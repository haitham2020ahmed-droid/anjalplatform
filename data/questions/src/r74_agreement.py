"""
r74 (owner): a new skill with 100 original MAP-style questions.

  Subject-Verb Agreement with Compound Subjects   (Language Usage · Grammar and Usage · L.{g}.1)

  and → plural · or / nor → the nearer subject · both…and / either…or / neither…nor (singular + plural, pronouns) ·
  not only…but also · as well as / along with / together with (not part of the subject) · each / every + compound ·
  a compound that names one thing (macaroni and cheese, a book title, "my friend and neighbor") · editing paragraphs.

Five RIT bands of 20 questions (easiest first), read on the RIT scale by the loader like r73
(src/server/questions/bank-scope.ts → ritOf):

  181–190  Grade 3 Below (183) · Grade 3 On (188)      and-subjects take a plural verb
  191–200  Grade 4 Below (194) · Grade 4 On (199)      or / nor: the verb agrees with the nearer subject
  201–210  Grade 4 Above (204) · Grade 5 On (206)      both…and / either…or / neither…nor, singular + plural, pronouns
  211–220  Grade 6 On (211)    · Grade 6 Above (216)   phrases between, as well as / along with, each / every, one thing
  221–230  Grade 8 Above (222) · Grade 9 Above (224)   editing paragraphs, error correction, the correct sentence

Run:  python3 data/questions/src/r74_agreement.py   →  data/questions/sets/agreement-skill-sets.json
Answer positions are balanced by the script (the correct choice is written first here, then placed).
"""
import json
import os
import random

BANDS = [
    ("181-190", [("BELOW", 3), ("ON", 3)], 1),
    ("191-200", [("BELOW", 4), ("ON", 4)], 1),
    ("201-210", [("ABOVE", 4), ("ON", 5)], 2),
    ("211-220", [("ON", 6), ("ABOVE", 6)], 2),
    ("221-230", [("ABOVE", 8), ("ABOVE", 9)], 3),
]
L = "ABCDEFGH"


# ------------------------------------------------------------------ authoring helpers (the right answer first)

def mc(stem, right, wrong, why, passage=None, title=None):
    return {"t": "MULTIPLE_CHOICE", "stem": stem, "right": right, "wrong": wrong, "why": why, "passage": passage, "title": title}


def dd(stem, right, wrong, why, passage=None, title=None):
    return {"t": "DROPDOWN", "stem": stem, "right": right, "wrong": wrong, "why": why, "passage": passage, "title": title}


def ms(stem, rights, wrongs, why, passage=None, title=None):
    return {"t": "MULTI_SELECT", "stem": stem, "rights": rights, "wrongs": wrongs, "why": why, "passage": passage, "title": title}


def ht(stem, segments, correct, why, passage=None, title=None):
    return {"t": "HOT_TEXT", "stem": stem, "segments": segments, "correct": correct, "why": why, "passage": passage, "title": title}


def grid(stem, cols, rows, why, passage=None, title=None):
    """rows: [(text, column index)]"""
    return {"t": "GRID", "stem": stem, "cols": cols, "rows": rows, "why": why, "passage": passage, "title": title}


def tf(stem, answer, why, passage=None, title=None):
    return {"t": "TRUE_FALSE", "stem": stem, "answer": answer, "why": why, "passage": passage, "title": title}


def ec(stem, segments, index, correction, why):
    return {"t": "ERROR_CORRECTION", "stem": stem, "segments": segments, "index": index, "correction": correction, "why": why, "passage": None, "title": None}


# ------------------------------------------------------------------ the paragraphs of the editing band

FAIR_T = "The Science Fair"
FAIR = ("(1) Every year, the students and teachers of our school hold a science fair. (2) This year, neither the gym nor "
        "the classrooms was big enough for all the projects. (3) The principal, along with two parents, have offered the "
        "courtyard instead. (4) Both the tables and the posters were set up before sunrise. (5) Either Reem or her "
        "teammates ____ each project to the visitors.")
CLUB_T = "The Reading Club"
CLUB = ("(1) The Reading Club meets every Tuesday after school. (2) Kalila and Dimna are the book we are reading this "
        "month. (3) Each boy and girl in the club takes a turn reading aloud. (4) Either the club leader or the members "
        "choose the next book. (5) The leader, together with her assistants, keep a list of new words.")
ULA_T = "A Trip to AlUla"
ULA = ("(1) My uncle and his family love history. (2) Last spring, not only my cousins but also my uncle were eager to "
       "see the old tombs at Hegra. (3) Each rock and carving ____ a story about people who lived long ago. (4) Our "
       "guide, as well as the signs near each site, explains what the carvings mean. (5) Neither the heat nor the long "
       "walks bothers my little cousin.")

# ================================================================== Subject-Verb Agreement with Compound Subjects

SA = [
    # ---------------- 181–190: subjects joined by and take a plural verb (Grade 3 Below ×10, Grade 3 On ×10)
    [
        mc("A compound subject is two or more subjects joined by a word such as and. Which sentence has a compound subject?",
           "Reem and Dana painted a picture of the sea.", ["Reem painted the sea and hung up the picture.", "Reem painted a big blue picture of the sea.", "Reem painted the sea with her new brushes."],
           "Reem and Dana are two subjects joined by and, so together they are a compound subject."),
        mc("Which verb correctly completes the sentence? “Fahad and Saud ____ football after school.”",
           "play", ["plays", "is playing", "has played"],
           "Two people joined by and make a plural subject, so the verb is play."),
        mc("Which verb correctly completes the sentence? “The cat and the kitten ____ on the soft rug.”",
           "sleep", ["sleeps", "is sleeping", "has slept"],
           "The cat and the kitten are two animals. Subjects joined by and take a plural verb: sleep."),
        tf("True or false: In the sentence “My mother and my aunt cook kabsa on Fridays,” the verb cook agrees with the subject.", True,
           "Mother and aunt are two people joined by and, so the plural verb cook is correct."),
        dd("Choose the verb that completes the sentence: The pen and the ruler ____ in my school bag.",
           "are", ["is", "was"],
           "The pen and the ruler are two things joined by and, so the verb is plural: are."),
        ht("Select the compound subject in this sentence about a walk.",
           ["Lulwa and Haya", "walked", "to the park", "with their father."], [0],
           "Lulwa and Haya are the two people who did the action, joined by and."),
        mc("Which sentence about the dates and the figs uses the correct verb?",
           "The dates and the figs taste sweet.", ["The dates and the figs tastes sweet.", "The dates and the figs is sweet.", "The dates and the figs was sweet."],
           "Dates and figs joined by and are plural, so the verb is taste (no -s)."),
        mc("Which verb correctly completes the sentence? “Majed and his cousin ____ to the souq every week.”",
           "go", ["goes", "is going", "has gone"],
           "Majed and his cousin are two people, so the subject is plural and the verb is go."),
        grid("Does each sentence about home and school use the correct verb?", ["Correct", "Not correct"],
             [("Hessa and Amal read together.", 0), ("The boy and his dog runs fast.", 1), ("The bus and the car stop at the light.", 0), ("My hat and my scarf is red.", 1)],
             "Subjects joined by and are plural, so they need plural verbs: read, run, stop, are."),
        mc("What is the compound subject of the sentence “Lemons and oranges grow on the trees in our yard”?",
           "Lemons and oranges", ["grow on the trees", "the trees in our yard", "oranges grow on"],
           "The subject tells what does the action: lemons and oranges. Together they are plural, so the verb is grow."),

        mc("Which verb correctly completes the sentence? “The teacher and the students ____ ready for the trip.”",
           "are", ["is", "was", "has been"],
           "The teacher and the students are joined by and, so the subject is plural: are."),
        mc("Which sentence about Turki and his team uses the correct verb?",
           "Turki and I are on the same team.", ["Turki and I am on the same team.", "Turki and I is on the same team.", "Turki and I was on the same team."],
           "Turki and I are two people. A plural subject takes are, even when I is part of it."),
        ms("Which two sentences about animals and dishes use the correct verb? Choose two.",
           ["The hawk and the falcon fly high.", "The plates and cups are on the table."], ["The hawk and the falcon flies high.", "The plates and cups is on the table."],
           "Subjects joined by and are plural: fly, are."),
        dd("Choose the verb that completes the sentence: Grandma and Grandpa ____ us every Friday.",
           "visit", ["visits", "is visiting"],
           "Grandma and Grandpa are two people, so the verb is plural: visit."),
        ec("Find and fix the verb that does not agree with its subject in this sentence about the zoo animals.",
           ["The tiger and the lion", "sleeps", "in the shade", "at the zoo."], 1, "sleep",
           "The tiger and the lion are two animals joined by and, so the verb is plural: sleep."),
        tf("True or false: The sentence “The sun and the wind dries the wet clothes” uses the correct verb.", False,
           "Sun and wind are joined by and, so the subject is plural: The sun and the wind dry the wet clothes."),
        mc("Which subject correctly completes the sentence “____ are playing in the yard”?",
           "Hamad and his sister", ["The little brown puppy", "Hamad’s older brother", "Our new neighbor"],
           "Are needs a plural subject. Hamad and his sister are two people joined by and."),
        mc("Which verb correctly completes the sentence? “A notebook and a pencil ____ on each desk.”",
           "sit", ["sits", "is sitting", "has sat"],
           "A notebook and a pencil are two things joined by and, so the verb is plural: sit."),
        ht("Select the two subjects that are joined by and in the sentence about the farm animals.",
           ["The goats", "and", "the sheep", "eat grass", "near the farm."], [0, 2],
           "The goats and the sheep are the two subjects. Together they take the plural verb eat."),
        mc("Why does the sentence “Noura and Shahad like to draw” use like and not likes?",
           "Two people are doing the action, so the verb is plural.", ["The sentence happens in the past, so the verb is plural.", "Noura is the only person doing the action in the sentence.", "The verb never ends in -s after the name of a girl."],
           "Noura and Shahad are joined by and. A compound subject with and is plural, so the verb is like."),
    ],
    # ---------------- 191–200: or / nor — the verb agrees with the nearer subject (Grade 4 Below ×10, Grade 4 On ×10)
    [
        mc("When two subjects are joined by or, the verb agrees with the subject closer to it. Which verb correctly completes the sentence? “Fahad or his brothers ____ the car on Saturday.”",
           "wash", ["washes", "is washing", "has washed"],
           "Brothers is closer to the verb and is plural, so the verb is wash."),
        mc("Which verb correctly completes the sentence? “My sisters or my mother ____ the bread every morning.”",
           "bakes", ["bake", "are baking", "have baked"],
           "Mother is closer to the verb and is singular, so the verb is bakes."),
        dd("Choose the verb that completes the sentence: A sandwich or some dates ____ in my lunch box.",
           "are", ["is", "was"],
           "Dates is closer to the verb and is plural, so the verb is are."),
        tf("True or false: In a compound subject joined by or, the verb always agrees with the first subject.", False,
           "With or, the verb agrees with the subject that is closer to the verb, not the first one."),
        mc("Which sentence about the lamp and the candles uses the correct verb?",
           "The lamp or the candles give light at night.", ["The lamp or the candles gives light at night.", "The candles or the lamp give light at night.", "The candles or the lamp are giving light."],
           "With or, the verb agrees with the closer subject. Candles is plural, so give is correct."),
        ht("In this sentence about the quiz, which subject does the verb is agree with? Select it.",
           ["Pencils", "or", "a pen", "is", "needed for the quiz."], [2],
           "The verb is agrees with a pen, the subject closer to it."),
        mc("Which verb correctly completes the sentence? “Juice or water ____ fine with lunch.”",
           "is", ["are", "were", "have been"],
           "Water is closer to the verb and is singular, so the verb is is."),
        grid("Which verb completes each sentence about food?", ["is", "are"],
             [("Milk or juice ___ in the fridge.", 0), ("Apples or a banana ___ in the basket.", 0), ("A banana or apples ___ in the basket.", 1), ("Cookies or cakes ___ on the tray.", 1)],
             "With or, the verb agrees with the closer subject: juice → is, a banana → is, apples → are, cakes → are."),
        mc("Which verb correctly completes the sentence? “Noura or her cousins ____ the plants each evening.”",
           "water", ["waters", "is watering", "has watered"],
           "Cousins is closer to the verb and is plural, so the verb is water."),
        mc("In the sentence “The players or the coach carries the water bottles,” why is carries correct?",
           "Coach is closer to the verb, and coach is singular.", ["Players is the first subject, and it is plural.", "Both subjects together are plural, so the verb ends in -s.", "Carries is correct with every compound subject."],
           "With or, the verb agrees with the closer subject. Coach is singular, so carries is correct."),

        mc("Nor works like or: the verb agrees with the nearer subject. Which verb correctly completes the sentence? “Neither the window nor the door ____ open.”",
           "is", ["are", "were", "have been"],
           "Door is closer to the verb and is singular, so the verb is is."),
        mc("Which verb correctly completes the sentence? “Neither the cup nor the plates ____ clean yet.”",
           "are", ["is", "was", "has been"],
           "Plates is closer to the verb and is plural, so the verb is are."),
        dd("Choose the verb that completes the sentence: My uncle or my older cousins ____ us to the beach.",
           "drive", ["drives", "is driving"],
           "Cousins is closer to the verb and is plural, so the verb is drive."),
        tf("True or false: The sentence “Neither the boys nor their father were late” uses the correct verb.", False,
           "Father is closer to the verb and is singular: Neither the boys nor their father was late."),
        ms("Which two sentences about the scarf and the gloves use the correct verb? Choose two.",
           ["Gloves or a scarf is in the drawer.", "A scarf or gloves are in the drawer."], ["Gloves or a scarf are in the drawer.", "A scarf or gloves is in the drawer."],
           "With or, the verb agrees with the closer subject: a scarf → is, gloves → are."),
        ec("Find and fix the verb that does not agree with its subject in this sentence about the taxi and the buses.",
           ["A taxi", "or two buses", "takes the team", "to the stadium."], 2, "take the team",
           "Buses is closer to the verb and is plural, so the verb is take."),
        mc("Which sentence about the clock and the lights uses the correct verb?",
           "Neither the clock nor the lights work.", ["Neither the clock nor the lights works.", "Neither the lights nor the clock work.", "Neither the lights nor the clock are working."],
           "Lights is closer to the verb and is plural, so work is correct. When clock is closer, the verb must be works or is working."),
        ht("Select the verb that does NOT agree with the nearer subject.",
           ["Salt or pepper", "make", "the soup", "taste", "better."], [1],
           "Pepper is closer to the verb make and is singular, so it should be makes. Taste is correct after makes."),
        mc("Which subject correctly completes the sentence “____ is waiting at the gate”?",
           "The girls or their teacher", ["The teacher or the girls", "The teacher and the girls", "Both girls and teachers"],
           "Is needs a singular subject closer to it. In “The girls or their teacher,” teacher is closer and singular."),
        mc("Which rule explains the verb in “Dates or a cake is served after dinner”?",
           "The verb agrees with the closer subject, a cake.", ["The verb agrees with the first subject, dates.", "Subjects joined by or always take a plural verb.", "Words for food always take a singular verb."],
           "With or, the verb agrees with the subject closer to it. A cake is singular, so is is correct."),
    ],
    # ---------------- 201–210: both / either / neither pairs, singular + plural, pronouns (Grade 4 Above ×10, Grade 5 On ×10)
    [
        mc("Which verb correctly completes the sentence? “Both Rakan and Ziyad ____ the answer to the riddle.”",
           "know", ["knows", "is knowing", "has known"],
           "Both…and joins two subjects into a plural subject, so the verb is know."),
        mc("Which verb correctly completes the sentence? “Either Maha or Asma ____ the class plant this week.”",
           "waters", ["water", "are watering", "have watered"],
           "With either…or, the verb agrees with the closer subject. Asma is singular, so the verb is waters."),
        mc("Which verb correctly completes the sentence? “Either the twins or their sister ____ the dishes tonight.”",
           "washes", ["wash", "are washing", "have washed"],
           "Sister is closer to the verb and is singular, so the verb is washes."),
        mc("Which verb correctly completes the sentence? “Neither the pilot nor the passengers ____ worried about the clouds.”",
           "were", ["was", "is", "has been"],
           "Passengers is closer to the verb and is plural, so the verb is were."),
        tf("True or false: Subjects joined by both…and always take a plural verb.", True,
           "Both…and adds the subjects together, so the verb is always plural."),
        dd("Choose the verb that completes the sentence: Either you or Talal ____ the first turn.",
           "takes", ["take", "are taking"],
           "Talal is closer to the verb and is singular, so the verb is takes."),
        dd("Choose the verb that completes the sentence: Neither Talal nor you ____ late today.",
           "are", ["is", "was"],
           "You is closer to the verb, and you always takes are, so the verb is are."),
        grid("Is each sentence about the lamp and the fan correct?", ["Correct", "Not correct"],
             [("Both the lamp and the fan are broken.", 0), ("Either the lamp or the fan are broken.", 1), ("Neither the lamp nor the fans work.", 0), ("Neither the fans nor the lamp work.", 1)],
             "Both…and is plural. With either…or and neither…nor, the verb agrees with the closer subject: the fan → is, the fans → work, the lamp → works."),
        ht("Select the subject that decides the verb in the sentence about the pets.",
           ["Neither", "the cats", "nor", "the dog", "likes", "the rain."], [3],
           "With neither…nor, the verb agrees with the closer subject. The dog is singular, so likes is correct."),
        mc("Which sentence about the soup and the bread uses the correct verb?",
           "Both the soup and the bread smell delicious.", ["Both the soup and the bread smells delicious.", "Both the soup and the bread is delicious.", "Both the soup and the bread was delicious."],
           "Both…and makes a plural subject, so the verb is smell."),

        mc("Which sentence about him and his friends uses the correct verb?",
           "Neither he nor his friends were at home.", ["Neither he nor his friends was at home.", "Neither his friends nor he were at home.", "Neither his friends nor he are at home."],
           "Friends is closer to the verb and is plural, so were is correct. When he is closer, the verb must be singular."),
        mc("Which verb correctly completes the sentence? “Either they or she ____ the key to the gate.”",
           "has", ["have", "are having", "were having"],
           "She is closer to the verb and is singular, so the verb is has."),
        mc("Which verb correctly completes the sentence? “Neither Jawaher nor her parents ____ ever seen snow.”",
           "have", ["has", "is", "was"],
           "Parents is closer to the verb and is plural, so the verb is have."),
        ms("Which two sentences about the coach and the players use the verb correctly? Choose two.",
           ["Either the coach or the players choose the songs.", "Both the coach and the players choose the songs."], ["Either the players or the coach choose the songs.", "Neither the players nor the coach choose the songs."],
           "Both…and is plural (choose). With either…or and neither…nor, the closer subject decides: the players → choose, the coach → chooses."),
        tf("True or false: The sentence “Neither my notebook nor my pencils is in my bag” uses the correct verb.", False,
           "Pencils is closer to the verb and is plural: Neither my notebook nor my pencils are in my bag."),
        ec("Find and fix the verb that does not agree with its subject in this sentence about the oranges and the melon.",
           ["Either the oranges", "or the melon", "are", "for dessert tonight."], 2, "is",
           "Melon is closer to the verb and is singular, so the verb is is."),
        mc("Which verb correctly completes the sentence? “Neither the map nor the signs ____ us the right way.”",
           "show", ["shows", "is showing", "has shown"],
           "Signs is closer to the verb and is plural, so the verb is show."),
        mc("Which pair of joining words always makes a compound subject that takes a plural verb?",
           "both … and", ["either … or", "neither … nor", "not only … but also"],
           "Both…and adds the subjects together. With the other pairs, the verb agrees with the closer subject."),
        dd("Choose the subject that completes the sentence: ____ is ready to present the project.",
           "Either the boys or Waleed", ["Both the boys and Waleed", "Either Waleed or the boys"],
           "Is needs a singular subject next to it. In “Either the boys or Waleed,” Waleed is closer and singular."),
        mc("Which change makes this sentence correct? “Neither the bakery nor the shops opens before nine.”",
           "Change opens to open.", ["Change Neither to Both.", "Change shops to shop’s.", "Change nor to and."],
           "Shops is closer to the verb and is plural, so the verb must be open."),
    ],
    # ---------------- 211–220: phrases between, as well as / along with, each / every, one thing (Grade 6 On ×10, Grade 6 Above ×10)
    [
        mc("Words such as as well as and along with do not make a compound subject. Which verb correctly completes the sentence? “Hamad, as well as his cousins, ____ to the desert camp every winter.”",
           "goes", ["go", "are going", "have gone"],
           "As well as his cousins is extra information. The subject is Hamad, which is singular, so the verb is goes."),
        mc("Which verb correctly completes the sentence? “The principal, along with the teachers, ____ the students at the gate.”",
           "greets", ["greet", "are greeting", "have greeted"],
           "Along with the teachers is not part of the subject. The principal is singular, so the verb is greets."),
        mc("Which verb correctly completes the sentence? “Every boy and girl in the class ____ a library card.”",
           "has", ["have", "are having", "were given"],
           "Every before a compound subject means each one alone, so the verb is singular: has."),
        mc("Which verb correctly completes the sentence? “Macaroni and cheese ____ my little brother’s favorite meal.”",
           "is", ["are", "were", "have been"],
           "Macaroni and cheese names one dish, so it takes a singular verb: is."),
        tf("True or false: In the sentence “Each desk and chair in the room has a number on it,” the verb has is correct.", True,
           "Each before a compound subject points to every item one at a time, so the verb is singular: has."),
        dd("Choose the verb that completes the sentence: The jug of water and the plate of dates ____ on the mat.",
           "are", ["is", "was"],
           "The subject is the jug and the plate (of water and of dates only describe them). Two things joined by and → are."),
        dd("Choose the verb that completes the sentence: The tray of cups and saucers ____ on the counter.",
           "is", ["are", "were"],
           "The subject is the tray. Of cups and saucers only describes it, so the verb is singular: is."),
        mc("Which sentence about Ziyad uses the correct verb?",
           "My best friend and neighbor, Ziyad, lives nearby.", ["My best friend and neighbor, Ziyad, live nearby.", "My best friend and my neighbor lives nearby.", "My best friend and my neighbor both lives nearby."],
           "Friend and neighbor name one person, Ziyad, so the verb is singular: lives. With my repeated, they are two people and need live."),
        ht("Select the verb that does not agree with its subject in the sentence about the captain.",
           ["The captain,", "together with his players,", "are", "proud of the trophy."], [2],
           "Together with his players is extra information. The captain is singular, so the verb should be is."),
        mc("Which verb correctly completes the sentence? “Not only the students but also the principal ____ excited about the trip.”",
           "is", ["are", "were", "have been"],
           "With not only…but also, the verb agrees with the closer subject. The principal is singular, so the verb is is."),

        mc("Which verb correctly completes the sentence? “Not only my uncle but also my cousins ____ the camels at the farm.”",
           "feed", ["feeds", "is feeding", "has fed"],
           "Cousins is closer to the verb and is plural, so the verb is feed."),
        mc("Which verb correctly completes the sentence? “Kalila and Dimna ____ a famous old book of animal fables.”",
           "is", ["are", "were", "have been"],
           "Kalila and Dimna is the title of one book, so it takes a singular verb: is."),
        ms("Which two sentences about the show and the bag use the verb correctly? Choose two.",
           ["Every teacher and parent was invited to the show.", "The bag, with all its books, is very heavy."], ["Every teacher and parent were invited to the show.", "The bag, with all its books, are very heavy."],
           "Every + a compound subject takes a singular verb (was). With all its books is extra, so the bag → is."),
        ec("Find and fix the verb that does not agree with its subject in this sentence about the teacher and her students.",
           ["The teacher,", "along with her students,", "plant", "trees every spring."], 2, "plants",
           "Along with her students is not part of the subject. The teacher is singular, so the verb is plants."),
        tf("True or false: The sentence “Salma, together with her sisters, are baking ma’amoul” uses the correct verb.", False,
           "Together with her sisters is extra information. Salma is singular: Salma, together with her sisters, is baking ma’amoul."),
        grid("Does each subject take a singular verb or a plural verb?", ["Singular verb", "Plural verb"],
             [("Every chair and table in the hall", 0), ("The tables and the chairs in the hall", 1), ("Nasser, as well as his sons,", 0), ("Both Nasser and his sons", 1)],
             "Every + compound and a subject followed by as well as take a singular verb. And and both…and take a plural verb."),
        mc("Which verb correctly completes the sentence? “The box of markers and the stack of papers ____ on the shelf.”",
           "are", ["is", "was", "has been"],
           "The subject is the box and the stack, joined by and. Of markers and of papers only describe them → are."),
        mc("Which verb correctly completes the sentence? “Each player and coach on the team ____ a new shirt.”",
           "gets", ["get", "are getting", "have gotten"],
           "Each before the compound subject means one at a time, so the verb is singular: gets."),
        dd("Choose the verb that completes the sentence: The leader of the scouts, along with two helpers, ____ the tents.",
           "checks", ["check", "are checking"],
           "The subject is the leader. Of the scouts and along with two helpers are not part of it, so the verb is checks."),
        mc("Why is the verb singular in “My cousin, along with her friends, visits the museum every month”?",
           "The phrase with along with is extra; the subject is cousin.", ["Along with joins the subjects, so together they are one.", "Friends is closer to the verb, so it decides the verb.", "Museum is the subject, and museum is a singular noun."],
           "Along with her friends does not make a compound subject. The subject is cousin, which is singular → visits."),
    ],
    # ---------------- 221–230: editing paragraphs, error correction, the correct sentence (Grade 8 Above ×10, Grade 9 Above ×10)
    [
        mc("Which change corrects the verb in sentence 2 about the fair?",
           "Change was to were.", ["Change neither to either.", "Change nor to or.", "Change big to bigger."],
           "Classrooms is closer to the verb and is plural, so the verb must be were.", FAIR, FAIR_T),
        ht("Select the two sentences in which every verb agrees with its subject.",
           ["(1) Every year, the students and teachers of our school hold a science fair.",
            "(2) This year, neither the gym nor the classrooms was big enough for all the projects.",
            "(3) The principal, along with two parents, have offered the courtyard instead.",
            "(4) Both the tables and the posters were set up before sunrise."], [0, 3],
           "Sentences 1 (students and teachers → hold) and 4 (both…and → were) are correct. Sentence 2 needs were; sentence 3 needs has offered.", FAIR, FAIR_T),
        mc("How should sentence 3 be written?",
           "The principal, along with two parents, has offered the courtyard instead.", ["The principal, along with two parents, have offered the courtyard instead.", "The principal, along with two parents, are offering the courtyard instead.", "The principal and two parents has offered the courtyard instead."],
           "Along with two parents is not part of the subject. The principal is singular → has offered.", FAIR, FAIR_T),
        dd("Choose the verb that correctly completes sentence 5.",
           "explain", ["explains", "is explaining"],
           "With either…or, the verb agrees with the closer subject. Teammates is plural → explain.", FAIR, FAIR_T),
        tf("True or false: The sentence “Neither the referee nor the players were sure what had happened” follows the rule for neither…nor.", True,
           "Players is closer to the verb and is plural, so were is correct."),
        mc("Which sentence about the storeroom keys is written correctly?",
           "Either the manager or the workers have the keys to the storeroom.", ["Either the workers or the manager have the keys to the storeroom.", "Neither the manager nor the workers has the keys to the storeroom.", "Both the manager and the workers has the keys to the storeroom."],
           "Workers is closer to the verb and is plural, so have is correct. Both…and always takes a plural verb."),
        ec("Find and fix the verb that does not agree with its subject in this sentence about the coach and the captains.",
           ["The coach,", "as well as the two captains,", "were interviewed", "after the final match."], 2, "was interviewed",
           "As well as the two captains is extra information. The coach is singular → was interviewed."),
        mc("In sentence 2, why should are be changed to is?",
           "Kalila and Dimna is the title of one book.", ["Kalila is closer to the verb than Dimna.", "Book is closer to the verb than the title.", "The sentence tells about something in the past."],
           "A title names one thing, even when it has and in it, so it takes a singular verb.", CLUB, CLUB_T),
        mc("Which is the correct way to write sentence 5?",
           "The leader, together with her assistants, keeps a list of new words.", ["The leader, together with her assistants, keep a list of new words.", "The leader and her assistants keeps a list of new words.", "The leader, together with her assistants, are keeping a list of new words."],
           "Together with her assistants is extra information. The leader is singular → keeps.", CLUB, CLUB_T),
        ms("Which two sentences of the paragraph about the club use the correct verb? Choose two.",
           ["Sentence 3", "Sentence 4"], ["Sentence 2", "Sentence 5"],
           "Sentence 3: each + compound → takes. Sentence 4: either…or, members is closer → choose. Sentences 2 and 5 need is and keeps.", CLUB, CLUB_T),

        mc("Which change corrects the verb in sentence 2 about the trip?",
           "Change were to was.", ["Change cousins to cousin.", "Change but also to and.", "Change eager to eagerly."],
           "With not only…but also, the verb agrees with the closer subject. My uncle is singular → was.", ULA, ULA_T),
        ht("Select the sentence in which the verb agrees with its subject even though a phrase comes between them.",
           ["(1) My uncle and his family love history.",
            "(2) Last spring, not only my cousins but also my uncle were eager to see the old tombs at Hegra.",
            "(4) Our guide, as well as the signs near each site, explains what the carvings mean.",
            "(5) Neither the heat nor the long walks bothers my little cousin."], [2],
           "In sentence 4, as well as the signs near each site comes between the subject and the verb, and explains correctly agrees with guide.", ULA, ULA_T),
        mc("How should sentence 5 be corrected?",
           "Neither the heat nor the long walks bother my little cousin.", ["Neither the heat nor the long walk bother my little cousin.", "Neither the heat or the long walks bothers my little cousin.", "Neither the heat nor the long walks is bothering my little cousin."],
           "Walks is closer to the verb and is plural, so the verb is bother.", ULA, ULA_T),
        dd("Choose the verb that correctly completes sentence 3.",
           "tells", ["tell", "are telling"],
           "Each before a compound subject means one at a time, so the verb is singular: tells.", ULA, ULA_T),
        tf("True or false: In the sentence “Ten minutes of reading and a short quiz are planned for each lesson,” the verb are is correct.", True,
           "Ten minutes of reading and a short quiz are two things joined by and, so the plural verb are is correct."),
        mc("Which verb correctly completes the sentence? “Beside the old well ____ a palm tree and a small stone bench.”",
           "stand", ["stands", "is standing", "has stood"],
           "The subject comes after the verb: a palm tree and a small stone bench. Joined by and, it is plural → stand."),
        ec("Find and fix the verb that does not agree with its subject in this sentence about the instructions.",
           ["Neither the instructions", "nor the example", "were", "clear enough for the new students."], 2, "was",
           "Example is closer to the verb and is singular, so the verb is was."),
        mc("Which sentence about the schedule is written correctly?",
           "Every student and teacher was given a copy of the schedule.", ["Every student and teacher were given a copy of the schedule.", "The students, along with a teacher, was given the schedule.", "Not only the teacher but also the students was given it."],
           "Every + a compound subject takes a singular verb. In the last two, students is the subject that decides the verb, so it must be were."),
        mc("In which sentence does the compound subject name one thing, so the verb is singular?",
           "Bread and butter is my brother’s favorite snack.", ["Bread and juice are on the kitchen table.", "The bread and the butter are in the fridge.", "Butter and jam are good on warm bread."],
           "Bread and butter here is one snack (buttered bread), so it takes is. In the others, two separate things take are."),
        mc("Which sentence best combines these two sentences? “Hessa is planning the party. Her sisters are planning the party too.”",
           "Hessa and her sisters are planning the party.", ["Hessa and her sisters is planning the party.", "Hessa, as well as her sisters, are planning it.", "Either Hessa or her sisters is planning it."],
           "Joined by and, Hessa and her sisters is a plural subject → are. With as well as, the verb would have to be is."),
    ],
]


# ------------------------------------------------------------------ build

def balanced(n, k, seed):
    """n positions in 0..k-1, as even as possible, in a shuffled order (seeded)."""
    out = [i % k for i in range(n)]
    random.Random(seed).shuffle(out)
    return out


def build(code, skill, items_by_band, meta):
    qs = []
    flat = [(b, i, q) for b, band in enumerate(items_by_band) for i, q in enumerate(band)]
    mc4 = [x for x in flat if x[2]["t"] == "MULTIPLE_CHOICE"]
    dd3 = [x for x in flat if x[2]["t"] == "DROPDOWN"]
    msx = [x for x in flat if x[2]["t"] == "MULTI_SELECT"]
    pos = {}
    for (x, p) in zip(mc4, balanced(len(mc4), 4, code + "mc")): pos[id(x[2])] = p
    for (x, p) in zip(dd3, balanced(len(dd3), 3, code + "dd")): pos[id(x[2])] = p
    pairs = [(0, 1), (0, 2), (0, 3), (1, 2), (1, 3), (2, 3)]
    for (x, p) in zip(msx, balanced(len(msx), 6, code + "ms")): pos[id(x[2])] = pairs[p]

    def place(right, wrong, p):
        opts = list(wrong)
        opts.insert(p, right)
        return opts

    n = 0
    for b, i, q in flat:
        band, slots, dok = BANDS[b]
        level, grade = slots[0] if i < 10 else slots[1]
        n += 1
        out = {"ref": f"R74-{code}-{n:03d}", "level": level, "grade": grade, "rit": band, "dok": dok,
               "mapTest": meta["mapTest"], "mapArea": meta["mapArea"]}
        t = q["t"]
        if q.get("passage"):
            out["passageTitle"] = q.get("title")
            out["passage"] = q["passage"]
        out["stem"] = q["stem"]
        if t == "MULTIPLE_CHOICE":
            p = pos[id(q)]
            out["options"] = place(q["right"], q["wrong"], p); out["correct"] = L[p]
        elif t == "DROPDOWN":
            p = pos[id(q)]
            out["type"] = t; out["options"] = place(q["right"], q["wrong"], p); out["correct"] = L[p]
        elif t == "MULTI_SELECT":
            a, c = pos[id(q)]
            opts = [None] * 4
            opts[a], opts[c] = q["rights"]
            rest = iter(q["wrongs"])
            opts = [o if o is not None else next(rest) for o in opts]
            out["type"] = t; out["options"] = opts; out["correct"] = L[a] + L[c]
        elif t == "HOT_TEXT":
            out["type"] = t
            out["hotText"] = {"segments": [{"id": f"s{k + 1}", "text": s} for k, s in enumerate(q["segments"])],
                              "correct": [f"s{k + 1}" for k in q["correct"]], "maxSelect": len(q["correct"])}
        elif t == "GRID":
            out["type"] = t
            out["grid"] = {"rows": [{"id": f"r{k + 1}", "text": r[0]} for k, r in enumerate(q["rows"])],
                           "columns": [{"id": f"c{k + 1}", "text": c} for k, c in enumerate(q["cols"])],
                           "answer": {f"r{k + 1}": f"c{r[1] + 1}" for k, r in enumerate(q["rows"])}}
        elif t == "TRUE_FALSE":
            out["type"] = t; out["answer"] = q["answer"]
        elif t == "ERROR_CORRECTION":
            out["type"] = t; out["segments"] = q["segments"]; out["errorIndex"] = q["index"]; out["correction"] = q["correction"]
        out["why"] = q["why"]
        qs.append(out)
    # one set per RIT band (20 questions): a load chunk stays short
    return [{"skill": skill, **{k: v for k, v in meta.items() if k != "mapTest"}, "band": band,
             "questions": [q for q in qs if q["rit"] == band]} for band, _, _ in BANDS]


SKILL = "Subject-Verb Agreement with Compound Subjects"
SA_META = {"grade": 5, "ccss": "L.5.1", "domain": "Grammar & Conventions", "mapTest": "Language Usage", "mapArea": "Language: Understand, Edit for Grammar, Usage"}

if __name__ == "__main__":
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    assert [len(b) for b in SA] == [20] * 5, [len(b) for b in SA]
    sets = build("SA", SKILL, SA, SA_META)
    doc = {"_note": "r74 (owner): a new skill, Subject-Verb Agreement with Compound Subjects (Language Usage · Grammar and Usage), "
                    "100 original MAP-style questions, five RIT bands of 20 (181–190 … 221–230), easiest first. Built by "
                    "data/questions/src/r74_agreement.py. The skill is created in Grades 4–6 when missing (Admin → Questions → "
                    "Load new questions → New skill: agreement with compound subjects). Its Learn lesson is LN-223.",
           "sets": sets}
    path = os.path.join(root, "data", "questions", "sets", "agreement-skill-sets.json")
    with open(path, "w", encoding="utf8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    print(path, sum(len(s["questions"]) for s in sets), "questions in", len(sets), "sets")
