// ROBOTIC TYLER: Tyler's own image rules (v2.40). ONE copy for everything that makes a picture: the
// Chrome extension's background and the desktop app's background import this file (classic script:
// sets globalThis.TylerImageRules), and the desktop app's images on this PC (app/local-images/guard.cjs)
// loads this same file. Cloud styles (OpenRouter, Venice) and the PC's own models all pass through it.
//
// These run before EVERY image, on every model (uncensored ones included), for everyone (the owner
// included). There is no setting, flag or parameter that skips them. "Uncensored" means the model
// itself doesn't refuse adult content about fictional adults; these rules are the line:
//
//   1. Never anything sexual, nude or revealing involving minors. Any age cue counts: words for
//      children and teens (in several languages), school roles and clothing, "young-looking" and the
//      like, ages under 18 (digits, words, spaced out or hidden in other readings such as "1 8"),
//      and combinations of weaker cues ("petite" + "pigtails"). On an uncensored model, prompts that
//      point to a minor are refused even when they aren't sexual, because such a model can add
//      nudity by itself.
//   2. Never sexual, nude or revealing images of real people: named public figures, streamers,
//      "my friend Sam", people in the chat (the caller passes their names), "photo of [Steam user]".
//
// Obfuscation is undone before matching: letter case, accents and full-width letters, look-alike
// letters from other alphabets, invisible characters, leetspeak (t33n, l0li), letters spaced or
// dotted out (l o l i, n.u.d.e), stretched letters (teeeen), words split in two (lo li) and words
// run together (teengirl). Image models don't understand "no" or "not", so "no kids" still counts
// as kids. The checker errs on the side of refusing; a refusal says why in plain words, so an
// honest prompt about adults can be reworded.
//
// check({prompt, negative, names, uncensored}) → {ok:true} or {ok:false, code, reason, cues}

(() => {
 'use strict';
 if(globalThis.TylerImageRules)return;
// ── vocabulary ──────────────────────────────────────────────────────────────
const W=s=>new Set(s.trim().split(/\s*\|\s*/));
// Clearly sexual or nude.
const SEXUAL=W(`nude|nudes|naked|nudity|nudist|nsfw|nsfl|sex|sexual|sexually|sexed|porn|porno|pornographic|pornography|xxx|erotic|erotica|explicit|lewd|hentai|ecchi|
 nipple|nipples|areola|areolas|areolae|breasts|boobs|boob|tits|titties|genital|genitals|genitalia|vagina|vaginal|vulva|pussy|clit|clitoris|labia|penis|penises|cock|cocks|dick|dicks|
 erection|testicles|scrotum|anus|anal|butthole|asshole|masturbate|masturbating|masturbation|orgasm|orgasms|cum|cumming|cumshot|semen|sperm|ejaculate|ejaculating|ejaculation|
 blowjob|blowjobs|fellatio|cunnilingus|handjob|footjob|intercourse|penetration|penetrated|fuck|fucks|fucking|fucked|screwing|rape|raped|orgy|threesome|gangbang|bukkake|creampie|
 bdsm|bondage|dominatrix|fetish|kinky|kink|topless|bottomless|undressed|undressing|unclothed|disrobed|stripping|stripper|striptease|horny|aroused|arousal|seduce|seducing|
 smut|hardcore|softcore|onlyfans|yaoi|futa|futanari|rule34|r34|r18|ahegao|oppai|paizuri|camgirl|camboy|prostitute|hooker|playboy|centerfold|squirt|squirting|lactating|lactation|breastfeeding|groping|grope|molest|molested|
 desnuda|desnudo|desnudas|desnudos|sexo|erotico|erotica|nue|nues|seins|baise|nackt|nackte|nackten|titten|muschi|schwanz|nuda|nudo|nude|tette|figa|cazzo|pelada|pelado|buceta|
 голая|голый|голые|голой|обнаженная|обнаженный|обнажённая|секс|порно|эротика|эротический|сиськи|киска`);
const SEXUAL_PHRASES=['spread legs','spread her legs','legs spread','spreading her legs','spread eagle','oral sex','sex act','in the nude','no clothes','without clothes','no clothing',
 'wearing nothing','nothing on','fully undressed','birthday suit','not wearing anything','clothes off','took off her clothes','takes off her clothes','see through clothes'];
// Revealing or suggestive (enough for the minors and real-people rules).
const SUGGESTIVE=W(`sexy|seductive|seductively|sensual|sultry|provocative|suggestive|lingerie|underwear|panties|panty|thong|g-string|gstring|bra|bras|braless|stockings|garter|garters|
 negligee|nightie|corset|cleavage|bikini|bikinis|swimsuit|swimsuits|swimwear|bathing|microbikini|boudoir|pinup|pin-up|risque|risqué|skimpy|revealing|see-through|seethrough|sheer|wet|
 upskirt|downblouse|cameltoe|ass|butt|booty|buttocks|bum|thighs|crotch|legs|bedroom|bed|shower|bath|bathtub|towel|kissing|kiss|making|flirting|flirty|teasing|tease|pose|posing|bent|bending|
 lap|straddling|straddle|undies|knickers|briefs|boxers|jockstrap|speedo|latex|leather|fishnet|fishnets|bodysuit|leotard|bunnysuit|maid|nurse|hot|steamy`);
// Some suggestive words are everyday words; alone they make a prompt suggestive only next to a clear cue.
const SUGGESTIVE_WEAK=W('legs|bed|bedroom|shower|bath|bathtub|towel|kiss|kissing|making|pose|posing|bent|bending|lap|leather|maid|nurse|hot|wet|thighs|bathing|sheer|tease|teasing|flirting|flirty|latex');
// Words that point to a minor, on their own.
const MINOR=W(`child|children|childs|childhood|childlike|childish|kid|kids|kiddo|kiddie|kiddy|kiddies|toddler|toddlers|infant|infants|baby|babies|newborn|preschooler|preschool|kindergarten|
 kindergartner|kindergartener|teen|teens|teenage|teenaged|teenager|teenagers|tween|tweens|preteen|preteens|pre-teen|adolescent|adolescents|adolescence|youngster|youngsters|juvenile|juveniles|
 minor|minors|underage|under-age|jailbait|loli|lolis|lolicon|lolita|lolitas|shota|shotas|shotacon|cub|cubs|pedo|pedophile|paedo|paedophile|pedophilia|prepubescent|pubescent|puberty|
 schoolgirl|schoolgirls|schoolboy|schoolboys|gradeschooler|grader|graders|middleschooler|highschooler|elementary|youth|chibi|babyface|babyfaced|shortstack|underdeveloped|undeveloped|
 daughter|stepdaughter|son|stepson|niece|nephew|granddaughter|grandson|diaper|diapers|pacifier|onesie|nursery|playground|daycare|randoseru|bloomers|buruma|serafuku|seifuku|
 jk|jc|js|joshikousei|joshikosei|joshi|chuugakusei|shougakusei|shogakusei|
 niña|niñas|niño|niños|nena|nene|menor|menores|colegiala|colegialas|adolescente|adolescentes|chiquilla|enfant|enfants|fillette|fillettes|gamine|ecoliere|ecolieres|collegienne|lyceenne|mineure|mineur|
 kindlich|schulmadchen|schulerin|minderjahrig|minderjahrige|jugendliche|bambina|bambino|bambini|bambine|ragazzina|ragazzino|minorenne|scolaretta|crianca|criancas|menino|garotinha|
 garotinho|novinha|novinho`);
// Words for sexualised minors: refused in any prompt, sexual or not.
const ALWAYS=W('loli|lolis|lolicon|shota|shotas|shotacon|jailbait|jailbate|pedo|pedos|pedophile|pedophiles|pedophilia|paedo|paedophile|paedophilia|childporn|toddlercon|cunny');
// Places where a child is likely to be shown undressed: with a minor cue, these count as revealing.
const MINOR_RISKY=W('bath|baths|bathing|bathtub|shower|showers|showering|towel|towels|sauna|undress|changing|lockerroom|skinnydipping');
// Phrases that point to a minor (matched on whole words, in order).
const MINOR_PHRASES=[
 'young girl','young girls','young boy','young boys','little girl','little girls','little boy','little boys','small girl','small boy','tiny girl','tiny boy','very young','too young',
 'young looking','younger looking','looks young','look young','looking young','youthful looking','looks underage','looks like a child','looks like a kid','looks like a teen',
 'child like','kid like','baby face','baby faced','baby doll face','school girl','school girls','school boy','school boys','school uniform','school uniforms','school swimsuit',
 'sailor uniform','gym uniform','high school','middle school','junior high','grade school','primary school','elementary school','prep school','boarding school','school student','high schooler',
 'in her teens','in his teens','late teens','early teens','barely legal','barely 18','almost 18','nearly 18','just turned 18','fresh 18','not yet 18','under 18','under eighteen','below 18',
 'small body','tiny body','child body','childs body','kid body','petite body','flat chested child','no breasts','no curves','hairless body','short stack','first period','training bra',
 'teddy bear','stuffed animal','sippy cup','sucking thumb','thumb sucking','with her dad','with her father','with his mom','step daughter','step son','step sis','step sister','step bro',
 'step brother','his daughter','her daughter','his son','her son','petite teen','teen girl','teen boy','girl scout','boy scout','high school student','middle school student','minor girl',
 'joshi kousei','joshi kosei','chuu gakusei','shou gakusei','petite fille','petit garcon','jeune fille','junges madchen','kleines madchen','ragazza giovane','chica joven','nina pequena'];
// Weaker youth cues: two of them in a sexual prompt are refused (the "petite + pigtails" kind).
const YOUTH_WEAK=W(`petite|tiny|little|young|younger|youthful|innocent|naive|girlish|boyish|pigtails|pigtail|twintails|twintail|braces|kneesocks|backpack|schoolbag|lollipop|
 plushie|smol|student|students|pupil|pupils|virgin|loli-like|childish`);
const YOUTH_WEAK_PHRASES=['flat chest','flat chested','small breasts','tiny breasts','small chest','knee socks','knee high socks','pleated skirt','plaid skirt','short stature','small frame',
 'tiny frame','small and slim','first time','twin tails','mary janes','hair bows','chubby cheeks','big innocent eyes'];
// "girl"/"boy" and their translations: in a sexual prompt they need an adult cue next to them.
const GIRLISH=W('girl|girls|gurl|grl|boy|boys|lass|lassie|chica|chicas|chico|chicos|muchacha|muchacho|fille|filles|garcon|garcons|madchen|junge|jungen|ragazza|ragazze|ragazzo|menina|meninas|garota|garotas|devushka|девушка|девушки|девочка|мальчик');
// Words that say the girl or boy next to them is an adult ("adult anime girl", "girl, 25 years old").
// They answer the girl/boy rule only, and only within a few words; they never cancel a minor cue.
const ADULT_QUAL=W('adult|adults|mature|grown|grownup|grown-up|milf|milfs|twenties|thirties|forties|fifties|twentysomething|thirtysomething|college-aged|legal|over18|18plus|adulte|adulta|erwachsene|erwachsen|adulto|взрослая|взрослый');
// Stop words for that window: another person starts here.
const SUBJECT_BREAK=W('and|with|man|men|woman|women|boy|boys|girl|girls|person|people|guy|guys|lady|ladies|friend|friends|kid|kids|child|children|y|et|und|e|и');
// What a sexual prompt's negative prompt mustn't push away from (it would push towards children).
const ADULT_NEGATED=W('adult|adults|mature|grown|grownup|grown-up|woman|women|man|men|milf|milfs|lady|ladies|aged');
const ADULT_NEGATED_PHRASES=['adult body','adult face','adult proportions','adult woman','adult man','grown woman','grown man','mature body','mature face','older woman','older man'];
// Cues that say a real person is meant.
const REAL_PHRASES=['real person','real people','real life','real-life','irl','celebrity','celebrities','celeb','celebs','famous person','famous people','famous actress','famous actor',
 'famous singer','streamer','youtuber','tiktoker','tik toker','influencer','instagram model','politician','president','prime minister','senator','congresswoman','congressman','royal family',
 'deepfake','deep fake','face swap','faceswap','lookalike','look alike','look-alike','likeness of','photo of my','picture of my','pic of my','pics of my','image of my',
 'my friend','my friends','my best friend','my girlfriend','my boyfriend','my gf','my bf','my wife','my husband','my ex','my crush','my sister','my brother','my mom','my mum','my mother',
 'my dad','my cousin','my aunt','my teacher','my boss','my coworker','my co worker','my colleague','my classmate','my neighbor','my neighbour','my roommate','my flatmate','my teammate',
 'my coach','my date','my tinder','his wife','his girlfriend','her boyfriend','someone i know','somebody i know','this person','this guy','this girl','this woman','this man','this dude',
 'that guy','that girl','from the chat','in the chat','in this chat','from chat','in the group','from the group','steam user','steam friend','steam profile','steam name','steam account',
 'our streamer','twitch streamer','from twitch','from youtube','from tiktok',
 'from instagram','her instagram','his instagram','selfie of','photo of user','picture of user','the owner','tylers owner',"tyler's owner"];
// Well-known people most often targeted (lower case, accents removed). Not complete: the full-name
// rule and the names the caller passes (the people in the chat) do most of the work.
const PEOPLE=['taylor swift','ariana grande','billie eilish','selena gomez','scarlett johansson','emma watson','emma stone','margot robbie','jennifer lawrence','gal gadot','zendaya','jenna ortega',
 'sydney sweeney','megan fox','kim kardashian','kourtney kardashian','khloe kardashian','kylie jenner','kendall jenner','beyonce','rihanna','shakira','madonna','lady gaga','dua lipa','olivia rodrigo',
 'sabrina carpenter','miley cyrus','nicki minaj','cardi b','doja cat','ice spice','megan thee stallion','jennifer aniston','angelina jolie','natalie portman','anne hathaway','emilia clarke',
 'sophie turner','maisie williams','millie bobby brown','elle fanning','dakota fanning','florence pugh','ana de armas','alexandra daddario','elizabeth olsen','brie larson','karen gillan',
 'zoe saldana','salma hayek','sofia vergara','jessica alba','kate upton','emily ratajkowski','gigi hadid','bella hadid','hailey bieber','jennifer lopez','jlo','britney spears','christina aguilera',
 'katy perry','lizzo','charli xcx','chappell roan','addison rae','charli damelio','dixie damelio','loren gray','pokimane','amouranth','valkyrae','belle delphine','corinna kopf','sssniperwolf',
 'emiru','alinity','indiefoxx','mia khalifa','sasha grey','riley reid','lana rhoades','angela white','eva elfie','donald trump','melania trump','ivanka trump','joe biden','kamala harris',
 'barack obama','michelle obama','hillary clinton','alexandria ocasio-cortez','ocasio cortez','aoc','elon musk','mark zuckerberg','jeff bezos','bill gates','vladimir putin','kim jong un',
 'greta thunberg','kate middleton','meghan markle','princess diana','prince harry','prince william','king charles','pope francis','pope leo','mrbeast','mr beast','pewdiepie','ishowspeed',
 'kai cenat','adin ross','xqc','ninja blevins','markiplier','tom holland','timothee chalamet','chris hemsworth','chris evans','ryan reynolds','ryan gosling','brad pitt','leonardo dicaprio',
 'keanu reeves','johnny depp','dwayne johnson','jason momoa','henry cavill','harry styles','justin bieber','shawn mendes','travis scott','kanye west','jungkook','jimin','jennie kim',
 'lalisa','jisoo','blackpink','nayeon','sza','olivia munn','priyanka chopra','deepika padukone','alia bhatt','katrina kaif','aishwarya rai','kiara advani'];
// Common first names, for the "Firstname Lastname" rule (a capitalised first name followed by a capitalised word).
const FIRST=W(`aaron|abby|abigail|adam|adrian|aiden|alex|alexa|alexander|alexandra|alexis|alice|alicia|alison|allison|amanda|amelia|amy|ana|andrea|andrew|angela|angelina|anna|anne|
 annie|anthony|ariana|ashley|audrey|austin|ava|bella|ben|benjamin|beth|bethany|bianca|blake|brandon|brian|brianna|brittany|brooke|caitlin|cameron|camila|carla|carlos|carmen|caroline|
 carrie|casey|catherine|charles|charlie|charlotte|chloe|chris|christina|christine|christopher|claire|clara|courtney|dan|daniel|daniela|danielle|david|
 debbie|diana|diane|dylan|elena|elizabeth|ella|ellie|emily|emma|eric|erica|erin|eva|evelyn|fiona|gabriel|gabriela|gabrielle|hailey|haley|hannah|harry|heather|helen|ian|isabel|
 isabella|isabelle|jack|jackie|jacob|james|jamie|jane|janet|jasmine|jason|jen|jenna|jennifer|jenny|jess|jessica|jill|joan|joe|john|joseph|josh|joshua|julia|julie|justin|
 kaitlyn|karen|kate|katherine|kathryn|katie|katy|kayla|kelly|kelsey|kendall|kim|kimberly|kristen|kylie|laura|lauren|leah|linda|lindsay|lisa|liz|lucy|lydia|madison|maggie|maria|
 mariah|marie|marissa|mary|matt|matthew|maya|megan|melanie|melissa|mia|michael|michelle|mike|mila|miley|molly|monica|morgan|naomi|natalie|natasha|nicole|nina|olivia|paige|pamela|
 patricia|paul|penelope|peter|rachel|rebecca|riley|robert|ryan|sabrina|sam|samantha|sandra|sara|sarah|scarlett|selena|serena|shannon|sharon|sierra|skylar|sofia|
 sophia|sophie|stephanie|steve|susan|taylor|tessa|thomas|tiffany|tom|tyler|valentina|vanessa|whitney|william|zoe|zoey|ahmed|aisha|akira|ali|alina|anastasia|
 andrei|ayumi|chen|dmitri|elif|fatima|hiroshi|ivan|katya|lena|mika|nadia|natalia|olga|priya|sakura|svetlana|wei|yuki|yuna|zara`);
// Non-Latin scripts (no spaces between words in some): matched as text.
const MINOR_CJK=['子供','子ども','こども','幼女','幼児','女児','男児','児童','小学生','中学生','女子高生','女子中学生','女子小学生','高校生','未成年','ロリ','ショタ','幼い','幼稚園','ランドセル','園児',
 '儿童','小孩','孩子','萝莉','蘿莉','正太','女童','男童','幼儿','初中生','女高中生','高中生','未成年人','小女孩','小男孩',
 '어린이','어린','미성년','여고생','여중생','초등학생','중학생','고등학생','로리','아동','유아',
 'ребенок','ребёнок','дети','детей','девочка','девочки','мальчик','школьница','школьник','подросток','подростки','несовершеннолетн','малолет','лоли',
 'طفل','طفلة','أطفال','قاصر','बच्चा','बच्ची','नाबालिग'];
const GIRLISH_CJK=['少女','美少女','女の子','男の子','女孩','男孩','소녀','소년'];
const SEXUAL_CJK=['裸','ヌード','エロ','全裸','性交','セックス','おっぱい','乳首','パンツ','下着','色情','性爱','做爱','裸体','露点','内衣','누드','알몸','나체','섹스','야한','속옷','🔞','🍆','🍑','💦',
 'عارية','عاري','جنس','नंगी','सेक्स'];
const MINOR_EMOJI=['👧','👦','🧒','👶','🍼','🧸','🎒','🚸'];
const ADULT_CJK=['成人','大人','熟女','女性','男性','成年','女人','男人','여성','성인','어른','남성','人妻'];
// Number words for ages.
const NUM={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,
 uno:1,dos:2,tres:3,cuatro:4,cinco:5,seis:6,siete:7,ocho:8,nueve:9,diez:10,once:11,doce:12,trece:13,catorce:14,quince:15,dieciseis:16,diecisiete:17,dieciocho:18,
 un:1,deux:2,trois:3,quatre:4,cinq:5,sept:7,huit:8,neuf:9,dix:10,onze:11,douze:12,treize:13,quatorze:14,quinze:15,seize:16,dixsept:17,'dix-sept':17,dixhuit:18,
 ein:1,eins:1,zwei:2,drei:3,vier:4,funf:5,sechs:6,sieben:7,acht:8,neun:9,zehn:10,elf:11,zwolf:12,dreizehn:13,vierzehn:14,funfzehn:15,sechzehn:16,siebzehn:17,achtzehn:18,
 dodici:12,tredici:13,quattordici:14,quindici:15,sedici:16,diciassette:17,diciotto:18,doze:12,treze:13,quatorze_pt:14,dezesseis:16,dezessete:17,dezoito:18};
const ORDINAL={first:1,second:2,third:3,fourth:4,fifth:5,sixth:6,seventh:7,eighth:8,ninth:9,tenth:10,eleventh:11,twelfth:12};
// Units that say a number is an age. "N years" alone is an age unless it reads as a duration ("10 years later").
const AGE_UNIT='(?:yo|y\\s*/\\s*o|y\\.o\\.?|(?:years?|yrs?|yr)\\s*-?\\s*olds?|(?:years?|yrs?)\\s+of\\s+age|anos|ans|jahre|jahren|jahrig\\w*|anni|let|lat|yasinda|tuoi)';
const BARE_YEARS='(?:years?|yrs?|yr)';
const NOT_AGE_AFTER='(?!\\s*(?:ago|later|earlier|before|after|from|since|of(?!\\s+age)|in\\b|long|on\\b|now|back|till|until|apart|older|younger|more|less|passed|went|have|has|had|into|experience|married|together))';
const NOT_AGE_BEFORE='(?<!(?:for|after|in|since|over|about|past|last|next|within|spent|took|ago|than|every|each|of)\\s+)';
const TEEN_OK=new Set(['eighteen','nineteen','canteen','canteens','sateen','velveteen','umpteen','umpteenth','poteen','eighteenth','nineteenth','eighteens']);
// Substrings that point to a minor inside one word, run together or not (teengirl, lolihentai); with
// the everyday words that happen to contain them.
const MINOR_SUB={loli:['lolipop','lolipops'],shota:[],lolicon:[],jailbait:[],underage:[],preteen:[],pedo:['torpedo','torpedoes','speedo','speedos','pedometer','pedology','tripedo'],paedo:[],
 toddler:[],schoolgirl:[],schoolboy:[],prepubescent:[],teen:[...TEEN_OK],kiddie:[],childporn:[],childlike:[],littlegirl:[],younggirl:[],jailbate:[]};
const SEXUAL_SUB={nude:['nudel','nudeln','denude','denuded'],naked:[],porn:[],hentai:[],nsfw:[],pussy:['pussycat','pussycats','pussywillow'],blowjob:[],cumshot:[],creampie:[],topless:[],
 titties:[],boobs:[],erotic:['nonerotic'],sexy:[],lingerie:[],panties:[],fuck:[],orgasm:[],masturbat:[]};
// The negative prompt added for uncensored models (it only helps with models that use one; it's not the line).
const SAFETY_NEGATIVE='child, children, kid, minor, teen, teenager, underage, young-looking, childlike, baby face, loli, shota, schoolgirl, school uniform, small body, flat chest, petite, child proportions';

// ── normalising ─────────────────────────────────────────────────────────────
const INVISIBLE=/[­͏؜ᅟᅠ឴឵᠋-᠏​-‏‪-‮⁠-⁯ㅤ︀-️﻿ﾠ]/g;
const LOOKALIKE={'а':'a','в':'b','е':'e','ё':'e','к':'k','м':'m','н':'h','о':'o','р':'p','с':'c','т':'t','у':'y','х':'x','і':'i','ї':'i','ј':'j','ѕ':'s','ԁ':'d','һ':'h','ӏ':'l','ɡ':'g',
 'α':'a','β':'b','γ':'y','ε':'e','η':'n','ι':'i','κ':'k','ν':'v','ο':'o','ρ':'p','τ':'t','υ':'u','χ':'x','ω':'w','ς':'c','ß':'ss','ø':'o','æ':'ae','œ':'oe','ł':'l','đ':'d','ı':'i'};
// Latin letters slipped into Cyrillic words ("гoлая" with a Latin o) are read back as Cyrillic.
const TO_CYR={a:'а',e:'е',o:'о',p:'р',c:'с',y:'у',x:'х',k:'к',m:'м',t:'т',h:'н',b:'в',i:'і'};
const LEET={'0':'o','1':'i','3':'e','4':'a','5':'s','6':'g','7':'t','8':'b','9':'g','@':'a','$':'s','!':'i','|':'l','+':'t','€':'e','£':'l','¡':'i'};
const strip=s=>s.normalize('NFD').replace(/\p{M}+/gu,'');
/** Lower case, NFKC (full-width letters), no invisible characters; colour names that contain "baby" made plain. */
function base(text){return String(text||'').normalize('NFKC').replace(INVISIBLE,'').toLowerCase().replace(/\bbaby[\s-]+(blue|pink)\b/g,'pastel $1').replace(/(\d)\s*\+/g,'$1plus');}
/** Latin letters only: accents off, look-alike letters from other alphabets folded. */
function latin(s){return strip(s).replace(/[^\x00-\x7f]/g,c=>LOOKALIKE[c]??c);}
function cyrillic(s){return s.replace(/[\p{L}]+/gu,w=>/\p{Script=Cyrillic}/u.test(w)?w.replace(/[a-z]/g,c=>TO_CYR[c]??c).replace(/і/g,'и'):w);}
/** Joins letters spaced, dotted or dashed out: "l o l i", "n.u.d.e", "t-e-e-n" → "loli", "nude", "teen". */
function joinSpaced(s){return s.replace(/(?<![\p{L}\p{N}])(?:[\p{L}\p{N}][\s._\-*~·•|/\\,'`^]{1,3}){2,}[\p{L}\p{N}](?![\p{L}\p{N}])/gu,m=>m.replace(/[^\p{L}\p{N}]/gu,''));}
/** Leetspeak inside words that have letters: "t33n" → "teen", "l0li" → "loli" (1 read as i, and as l). */
function deleet(s,one='i'){return s.replace(/[\p{L}\p{N}@$!|+€£¡]+/gu,w=>/\p{L}/u.test(w)&&/[0-9@$!|+€£¡]/.test(w)?w.replace(/[0-9@$!|+€£¡]/g,c=>c==='1'||c==='|'||c==='!'||c==='¡'?one:LEET[c]):w);}
/** Stretched letters: "teeeen" → "teen" and "ten"; only runs of three or more change. */
const squeeze=(s,n)=>s.replace(/(\p{L})\1{2,}/gu,n===1?'$1':'$1$1');
const words=s=>s.split(/[^\p{L}\p{N}'’-]+/u).flatMap(w=>{const c=w.replace(/[’']s$/,'').replace(/^[-'’]+|[-'’]+$/g,'');return c.includes('-')?[c,...c.split('-'),c.replace(/-/g,'')]:[c];}).filter(Boolean);
/** Every reading of a text that the checks look at. */
function readings(text){
 const b=base(text),l=latin(b),j=joinSpaced(l);
 const set=new Set([b,cyrillic(b),l,j,deleet(j),deleet(j,'l'),deleet(l),deleet(l,'l')]);
 for(const v of [...set]){set.add(squeeze(v,1));set.add(squeeze(v,2));}
 return [...set];
}
function analyse(text){
 const rs=readings(text),toks=new Set(),phr=[];
 for(const r of rs){for(const w of words(r))toks.add(w);phr.push(' '+r.replace(/[^\p{L}\p{N}]+/gu,' ').trim()+' ');}
 // Words split in two ("lo li", "te en", "chi ld"): adjacent short pieces joined.
 for(const r of rs){const ws=r.split(/[^\p{L}\p{N}]+/u).filter(Boolean);for(let i=0;i+1<ws.length;i++)if(ws[i].length<=4&&ws[i+1].length<=4)toks.add('~'+ws[i]+ws[i+1]);}
 return {raw:String(text||''),base:base(text),rs,toks,phr};
}
const stemmed=w=>[w,w.replace(/'s$/,''),w.endsWith('s')?w.slice(0,-1):w,w.endsWith('es')?w.slice(0,-2):w];
/** Whole words of `set` in the text (split words joined back count too). */
function wordHits(a,set){const out=new Set();for(const t of a.toks){const joined=t.startsWith('~'),w=joined?t.slice(1):t;for(const s of joined?[w]:stemmed(w))if(set.has(s)){out.add(s);break;}}return [...out];}
function phraseHits(a,list){return list.filter(p=>a.phr.some(x=>x.includes(' '+p+' ')));}
function textHits(a,list){return list.filter(p=>a.rs.some(r=>r.includes(p))||a.raw.includes(p));}
/** Cue words inside longer words ("teengirl"), except the everyday words listed with them. */
function subHits(a,table){
 const out=new Set();
 for(const t0 of a.toks){const t=t0.replace(/^~/,'');for(const [p,ok] of Object.entries(table))if(t.length>p.length&&t.includes(p)&&!ok.some(o=>t.includes(o)))out.add(t);}
 return [...out];
}

// ── ages ────────────────────────────────────────────────────────────────────
/** Every age a text mentions, in every reading ("1 8 year old" → 18, 1 and 8). */
function ages(a){
 const out=[];
 const add=(digits,src,extra={})=>{const groups=String(digits).trim().split(/[\s.,_-]+/).filter(Boolean);if(!groups.length)return;
  const vals=new Set([Number(groups.join('')),...groups.map(Number)]);for(const v of vals)if(Number.isFinite(v))out.push({age:v,src:src.trim(),...extra});};
 const D='(\\d+(?:[\\s.,_-]+\\d+)*)';
 for(const r of a.rs){
  const s=' '+r+' ';
  for(const m of s.matchAll(new RegExp(D+'\\s*[-–]?\\s*'+AGE_UNIT+'(?![a-z])','gi')))add(m[1],m[0]);
  for(const m of s.matchAll(new RegExp(NOT_AGE_BEFORE+'(?<![\\d.,])'+D+'\\s*[-–]?\\s*'+BARE_YEARS+'(?![a-z])'+NOT_AGE_AFTER,'gi')))add(m[1],m[0]);
  for(const m of s.matchAll(/(?:\baged?|\bage\s*[:=]|\bedad|\bage de|\balter|\beta|\bidade|\bвозраст\w*)\s*[:=]?\s*(?:of\s*)?(\d+(?:[\s.,]+\d+)*)/gi))add(m[1],m[0]);
  for(const m of s.matchAll(/(\d+)\s*(?:歳|才|岁|歲|세|살|лет|года|год)/g))add(m[1],m[0]);
  for(const m of s.matchAll(/(\d+)\s*plus\b/g))add(m[1],m[0],{plus:true});
  for(const m of s.matchAll(/(?<![a-z])([a-z]+(?:[\s-][a-z]+)?)\s*[-–]?\s*(?:years?\s*-?\s*olds?|year\s*-?\s*olds?|yrs?\s*-?\s*olds?|yo|y\/o|(?:years?|yrs?)\s+of\s+age|anos|ans|jahre|jahrig\w*|anni)(?![a-z])/gi)){
   const w=m[1].replace(/\s+/g,' ').split(/[\s-]/),last=w.at(-1),pair=w.join('');
   if(NUM[pair]!=null)out.push({age:NUM[pair],src:m[0].trim()});else if(NUM[last]!=null)out.push({age:NUM[last],src:m[0].trim()});}
  for(const m of s.matchAll(/(?:\baged?|\bage)\s+([a-z]+)/gi))if(NUM[m[1]]!=null)out.push({age:NUM[m[1]],src:m[0].trim()});
  for(const m of s.matchAll(/\b(\d{1,2})\s*(?:st|nd|rd|th)?\s*-?\s*grade(?:rs?)?\b|\bgrade\s*(\d{1,2})\b|\b(\d{1,2})\s*(?:st|nd|rd|th)\s*graders?\b/gi))out.push({age:5+Number(m[1]||m[2]||m[3]),src:m[0].trim(),grade:true});
  for(const m of s.matchAll(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth)\s*-?\s*grade(?:rs?)?\b/gi))out.push({age:5+ORDINAL[m[1].toLowerCase()],src:m[0].trim(),grade:true});
  for(const m of s.matchAll(/\b(?:year|yr)\s*(\d{1,2})\s*(?:student|pupil|girl|boy|kid)s?\b/gi))out.push({age:4+Number(m[1]),src:m[0].trim(),grade:true});
  for(const m of s.matchAll(/\bin (?:her|his|their) (\d)0s\b/gi))out.push({age:Number(m[1])*10,src:m[0].trim()});
  // "she is 16", "he's 15", "who just turned 14"; "girl, 16"; "(16f)", "16f".
  for(const m of s.matchAll(/\b(?:she|he|they|who|i|girl|boy|kid|child)\s*(?:is|'s|s|was|are|am|turned|just turned|is now|aged)\s+(?:only\s+|just\s+|barely\s+)?(\d{1,3})(?![\d.,]*\s*(?:cm|mm|kg|lbs?|inch|inches|ft|feet|%|px|minutes?|hours?|days?|weeks?|months?|times?|m\b|in\b))/gi))add(m[1],m[0]);
  for(const m of s.matchAll(/\b(?:girl|boy|woman|man|lady|female|male|teen|kid|child|she|he)s?\s*[,(:-]\s*(\d{1,2})\s*[),]?(?![\d.]*\s*(?:cm|mm|kg|lbs?|inch|inches|ft|feet|%|px|x\b|st\b|nd\b|rd\b|th\b|m\b|in\b))/gi))add(m[1],m[0]);
  for(const m of s.matchAll(/\(\s*(\d{1,2})\s*[fm]\s*\)|\b(\d{1,2})\s*\/\s*[fm]\b|\b(\d{2})[fm]\b/gi))add(m[1]||m[2]||m[3],m[0]);
 }
 return out;
}
/** Does each "girl"/"boy" have an adult qualifier right next to it ("adult anime girl", "girl, 25 years old")? */
function girlsQualified(a){
 let any=false;
 for(const r of [latin(a.base),a.base]){
  const t=r.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  for(let i=0;i<t.length;i++){
   if(!GIRLISH.has(t[i])&&!GIRLISH.has(t[i].replace(/s$/,'')))continue;
   any=true;let ok=false;
   const look=(j)=>{const w=t[j];if(ADULT_QUAL.has(w))return true;
    const n=/^(\d{2,3})(?:yo|plus|s)?$/.exec(w);if(n&&Number(n[1])>=18&&Number(n[1])<120){const next=(t[j+1]||'')+' '+(t[j+2]||'');if(/plus|yo|s$/.test(w)||/^(year|years|yrs|yr|yo)\b/.test(next)||(t[j-1]==='aged'||t[j-1]==='age'))return true;}
    return false;};
   for(let j=i-1;j>=Math.max(0,i-4)&&!ok;j--){if(SUBJECT_BREAK.has(t[j]))break;ok=look(j);}
   for(let j=i+1;j<=Math.min(t.length-1,i+5)&&!ok;j++){if(SUBJECT_BREAK.has(t[j]))break;ok=look(j);}
   if(!ok)return false;
  }
 }
 return any;
}

// ── the check ───────────────────────────────────────────────────────────────
const RULE=' This rule applies to every model (uncensored ones too) and to everyone, the owner included.';
const q=list=>[...new Set(list)].slice(0,3).map(x=>'“'+x+'”').join(', ');
const refuse=(code,reason,cues)=>({ok:false,code,reason,cues:[...new Set(cues)].slice(0,8)});
/** Names (chat members, Steam friends) worth matching: 3+ letters, not an everyday word Tyler checks for. */
function nameForms(names){
 const out=[];
 for(const n of (Array.isArray(names)?names:[]).slice(0,500)){
  const a=latin(base(n)).trim();if(!a)continue;
  const sq=a.replace(/[^\p{L}\p{N}]+/gu,''),dl=deleet(a).replace(/[^\p{L}\p{N}]+/gu,'');
  if(sq.length<3)continue;
  const ws=words(a);if(ws.length===1&&[SEXUAL,SUGGESTIVE,MINOR,GIRLISH,YOUTH_WEAK,ADULT_QUAL,SUBJECT_BREAK].some(s=>s.has(ws[0])))continue;
  out.push({name:String(n).slice(0,40),phrase:' '+a.replace(/[^\p{L}\p{N}]+/gu,' ').trim()+' ',sq,dl});
 }
 return out;
}
function nameHits(a,forms){
 const hits=[];
 for(const f of forms){
  if(a.phr.some(x=>x.includes(f.phrase))){hits.push(f.name);continue;}
  // Run together or written with symbols: only for longer names, so short ones don't match inside words.
  if(f.sq.length>=5&&[...a.toks].some(t=>t.includes(f.sq)||t.includes(f.dl)))hits.push(f.name);
 }
 return hits;
}
function fullNames(raw){
 const out=[];
 for(const m of String(raw||'').normalize('NFKC').matchAll(/(?<![\p{L}])(\p{Lu}[\p{Ll}]{1,15})\s+(?:\p{Lu}\.\s+)?(\p{Lu}[\p{Ll}'’-]{1,20})(?![\p{L}])/gu)){
  const first=strip(m[1]).toLowerCase(),last=strip(m[2]).toLowerCase();
  if(FIRST.has(first)&&![SEXUAL,SUGGESTIVE,MINOR,GIRLISH,YOUTH_WEAK,ADULT_QUAL,SUBJECT_BREAK].some(s=>s.has(last)))out.push(m[1]+' '+m[2]);
 }
 return out;
}

/**
 * Tyler's image rules. `names`: people in the chat and Steam friends (their display names), so
 * "nude <name>" is refused. `uncensored`: the chosen model is uncensored (then any minor cue is refused).
 */
function check({prompt,negative='',names=[],uncensored=false}={}){
 const a=analyse(prompt),n=analyse(negative);
 // What the prompt is.
 const sexualWords=[...wordHits(a,SEXUAL),...phraseHits(a,SEXUAL_PHRASES),...textHits(a,SEXUAL_CJK),...subHits(a,SEXUAL_SUB)];
 const suggestiveAll=wordHits(a,SUGGESTIVE),suggestiveStrong=suggestiveAll.filter(w=>!SUGGESTIVE_WEAK.has(w));
 const sexual=sexualWords.length>0;
 const revealingBase=sexual||suggestiveStrong.length>0||suggestiveAll.length>=2;
 // Who is in it.
 const ageList=ages(a),minorAges=ageList.filter(x=>x.age<18),adultAges=ageList.filter(x=>x.age>=18);
 const minorAll=[...wordHits(a,MINOR),...phraseHits(a,MINOR_PHRASES),...textHits(a,MINOR_CJK),...textHits(a,MINOR_EMOJI),...subHits(a,MINOR_SUB),...minorAges.map(x=>x.src)];
 const revealing=revealingBase||(minorAll.length>0&&wordHits(a,MINOR_RISKY).length>0);
 // Some words are minors only in some senses ("minor injury", "a son", "elementary"): they count in a revealing prompt.
 const soft=new Set(['son','sons','nephew','niece','youth','elementary','playground','nursery','jk','jc','js','joshi','baby','babies','grader','graders','minor','minors','cub','cubs','menor','nena','nene']);
 const minorWords=revealing?minorAll:minorAll.filter(w=>!soft.has(w));
 const weak=[...new Set([...wordHits(a,YOUTH_WEAK),...phraseHits(a,YOUTH_WEAK_PHRASES)])];
 const girlish=[...wordHits(a,GIRLISH),...textHits(a,GIRLISH_CJK)],girlsOk=girlish.length?girlsQualified(a):true;
 const people=[...phraseHits(a,PEOPLE),...[...a.toks].flatMap(t=>PEOPLE.filter(p=>p.length>=8&&t.includes(p.replace(/[^a-z]/g,''))))];
 const realCues=phraseHits(a,REAL_PHRASES),mentions=[...String(prompt||'').matchAll(/(?<![\w])@[\p{L}\p{N}_.-]{2,32}/gu)].map(m=>m[0]);
 const chatNames=nameHits(a,nameForms(names)),full=fullNames(prompt);
 const noNot=phraseHits(a,['no kids','no children','no child','not a child','not a kid','no minors','not a minor','not a teen','no teens','not underage','no underage']).length
  ?' (Image models don’t understand “no” or “not”: words like these make a child more likely, so leave them out.)':'';

 // 0. Words that mean sexualised minors: never, in any prompt.
 const always=[...wordHits(a,ALWAYS),...subHits(a,{loli:[...MINOR_SUB.loli,'lolita'],shota:[],lolicon:[],jailbait:[],pedo:MINOR_SUB.pedo,paedo:[],childporn:[]})];
 if(always.length)return refuse('minor','Tyler won’t make this image: '+q(always)+' means sexualised minors. Tyler never makes sexual or revealing images involving minors.'+RULE,always);
 // 1. Minors.
 if(revealing&&minorWords.length)
  return refuse('minor','Tyler won’t make this image: it’s sexual or revealing and points to someone under 18 ('+q(minorWords)+'). Tyler never makes sexual or revealing images involving minors.'+RULE+noNot,minorWords);
 if(uncensored&&minorWords.length)
  return refuse('minor_uncensored','Tyler won’t make this image with an uncensored model: it points to someone under 18 ('+q(minorWords)+'), and an uncensored model can add nudity by itself. Choose a standard model for pictures with children in them (never anything sexual or revealing).'+RULE,minorWords);
 if(revealing&&weak.length>=2)
  return refuse('youthful','Tyler won’t make this image: it’s sexual or revealing and together '+q(weak)+' make someone look like a child. Describe an adult without features that make them look young.'+RULE,weak);
 if((revealing||uncensored)&&girlish.length&&!girlsOk)
  return refuse('age_unclear','Tyler won’t make this image as written: it’s '+(revealing?'sexual or revealing':'for an uncensored model')+' and says '+q(girlish)+' without saying right there that they’re an adult. Write “woman” or “man”, or put the adult age next to it (“adult girl”, “girl, 25 years old”), with nothing that makes them look young.'+RULE,girlish);
 if(revealing&&girlish.length&&weak.length)
  return refuse('youthful','Tyler won’t make this image: it’s sexual or revealing, says '+q(girlish)+' and adds '+q(weak)+', which together make someone look young. Describe an adult woman or man instead.'+RULE,[...girlish,...weak]);
 if(revealing){
  const negAdult=[...wordHits(n,ADULT_NEGATED),...phraseHits(n,ADULT_NEGATED_PHRASES)];
  if(negAdult.length)return refuse('negative_adult','Tyler won’t make this image: it’s sexual or revealing and the negative prompt pushes away from adults ('+q(negAdult)+'), which pushes towards someone young. Take those words out of the negative prompt.'+RULE,negAdult);
 }
 // 2. Real people.
 if(revealing){
  const who=[...people,...chatNames,...mentions,...realCues];
  if(who.length)return refuse('real_person','Tyler won’t make this image: it’s sexual or revealing and is about a real person ('+q(who)+'). Tyler never makes sexual, nude or revealing images of real people: celebrities, streamers, people in the chat or anyone’s friends. Made-up adults are fine.'+RULE,who);
  if(full.length)return refuse('real_name','Tyler won’t make this image: it’s sexual or revealing and '+q(full)+' looks like a real person’s name. If it’s a made-up adult character, describe them without a real-sounding full name.'+RULE,full);
 }
 return {ok:true,sexual,revealing};
}
/** The negative prompt for a model that uses one: the safety words, then the owner's own. */
function negativeFor(model,own=''){const o=String(own||'').trim();return model?.negative?(o?SAFETY_NEGATIVE+', '+o:SAFETY_NEGATIVE):o;}
globalThis.TylerImageRules=Object.freeze({check,negativeFor,SAFETY_NEGATIVE,readings,ages,analyse});
})();
