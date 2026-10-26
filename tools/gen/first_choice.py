# Пул «первых выборов» младенчества (ТЗ P2) + отложенные последствия в 15–20 лет.
import json
import os
ROOT=os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../src/content/common/')
D=[15,20]
def de(t): return [{"trigger_event": t, "after_years": D, "chance": 1}]
def P(k,v): return {"param":k,"delta":v}
events=[]; ru={}; en={}
def ev(id, scene, topic, choices, title, text, opts):
    events.append({"id":id,"type":"family","first_choice":True,"age_range":[0,0],"base_weight":1,"once":True,"topic":topic,"scene":scene,"choices":choices})
    ru[f"ev.{id}.title"],en[f"ev.{id}.title"]=title
    ru[f"ev.{id}.text"],en[f"ev.{id}.text"]=text
    for cid,(lr,le,okr,oke) in opts.items():
        ru[f"ev.{id}.{cid}"]=lr; en[f"ev.{id}.{cid}"]=le
        ru[f"ev.{id}.{cid}.ok"]=okr; en[f"ev.{id}.{cid}.ok"]=oke
def echo(id, scene, topic, effects, title, text):
    events.append({"id":id,"type":"family","trigger_only":True,"base_weight":1,"once":True,"topic":topic,"scene":scene,"effects":effects})
    ru[f"ev.{id}.title"],en[f"ev.{id}.title"]=title
    ru[f"ev.{id}.text"],en[f"ev.{id}.text"]=text

H={"place":"home","time":"dawn","people":3,"props":["cradle","lamp"]}
# 1. Оберег
ev("fc_amulet",H,"family",[
  {"id":"grandma","effects":[P("faith",1)],"delayed_effects":de("fc_amulet_kept")},
  {"id":"priest","effects":[P("money",-5),P("faith",2)],"delayed_effects":de("fc_amulet_blessed")},
  {"id":"nothing","effects":[P("self_esteem",1)]}],
  ("Оберег над колыбелью","Charm over the cradle"),
  ("Бабушка принесла к твоей колыбели оберег — узелок, о содержимом которого она молчит. Отец хмурится: «Лучше позвать служителя, пусть благословит как положено». Решать родителям — то есть тебе.",
   "Your grandmother brought a charm to your cradle — a little knot whose contents she will not name. Your father frowns: \"Better call a priest and have it blessed properly.\" Your parents must decide — that is, you must."),
  {"grandma":("Повесить бабушкин узелок","Hang grandmother's knot","Узелок повис над колыбелью. Бабушка довольно кивнула и больше о нём не говорила.","The knot hung over the cradle. Grandmother nodded, satisfied, and never spoke of it again."),
   "priest":("Позвать служителя","Call a priest","Служитель прочитал молитву над тобой и взял за труды несколько монет. Мать успокоилась.","The priest said a prayer over you and took a few coins for his trouble. Your mother was at peace."),
   "nothing":("Обойтись без этого","Do without it","Отец сказал: «Ребёнку нужны молоко и тепло, а не узелки». Колыбель осталась пустой сверху.","Your father said: \"A child needs milk and warmth, not knots.\" Nothing hung over the cradle.")})
echo("fc_amulet_kept",{"place":"home","time":"night","people":1,"props":["lamp"]},"life",[P("self_esteem",4),P("faith",2)],
  ("Бабушкин узелок","Grandmother's knot"),
  ("Разбирая старый сундук, ты {g:нашёл|нашла} тот самый узелок, что висел над твоей колыбелью. Внутри — щепоть соли, уголёк и прядь седых волос. Ты повязал{g:|а} его на шею и с тех пор не снимаешь.",
   "Going through an old chest, you found the very knot that hung over your cradle. Inside: a pinch of salt, a coal and a lock of grey hair. You tied it round your neck and have worn it ever since."))
echo("fc_amulet_blessed",{"place":"temple","time":"day","people":2,"props":["altar","lamp"]},"life",[P("reputation",4),P("faith",3)],
  ("Старый служитель","The old priest"),
  ("Старый служитель остановил тебя у храма: «Я тебя помню — благословлял ещё в колыбели. Крикливый был{g:|а}». С тех пор он здоровается с тобой первым, и соседи это замечают.",
   "The old priest stopped you by the temple: \"I remember you — I blessed you in the cradle. A loud one you were.\" Since then he greets you first, and the neighbours notice."))
# 2. Кормилица
ev("fc_wetnurse",{"place":"home","time":"day","people":3,"props":["cradle","bed"]},"health",[
  {"id":"nurse","requirements":[{"param":"money","op":">=","value":30}],"effects":[P("money",-30),P("health",3)],"delayed_effects":de("fc_milk_brother")},
  {"id":"neighbor","effects":[P("health",2)],"delayed_effects":de("fc_neighbor_favor")},
  {"id":"goat","effects":[P("health",-2)]}],
  ("Нет молока","No milk"),
  ("После родов мать ослабла, и молока не хватает — ты плачешь ночами. Можно нанять кормилицу, попросить соседку, у которой свой грудной, или выкармливать козьим молоком.",
   "After the birth your mother is weak and has too little milk — you cry at night. You could hire a wet nurse, ask a neighbour with a baby of her own, or feed you goat's milk."),
  {"nurse":("Нанять кормилицу","Hire a wet nurse","Кормилица пришла со своим сыном. Вы росли у одной груди — молочная родня.","The wet nurse came with her own son. You grew up at the same breast — milk brothers."),
   "neighbor":("Попросить соседку","Ask the neighbour","Соседка кормила тебя вместе со своим ребёнком и денег не взяла. «Сочтёмся», — сказала она.","The neighbour fed you alongside her own child and took no money. \"We'll settle up some day,\" she said."),
   "goat":("Козье молоко","Goat's milk","Тебя выкормили козьим молоком из рожка. Ты рос{g:|ла} хлипк{g:им|ой}, но рос{g:|ла}.","You were fed goat's milk from a horn. You grew up frail, but you grew.")})
echo("fc_milk_brother",{"place":"street","time":"day","people":2,"props":["tree"]},"family",[{"add_npc":"friend","attitude":60},P("loneliness",-6)],
  ("Молочная родня","Milk kin"),
  ("Сын кормилицы, с которым вы делили молоко, вернулся в ваши края. Вы не виделись много лет, но он узнал тебя сразу: «Молочное родство крепче кровного». Теперь у тебя есть друг, на которого можно положиться.",
   "The wet nurse's son, who shared your milk, came back to your parts. You had not met in years, but he knew you at once: \"Milk kin is stronger than blood.\" Now you have a friend you can rely on."))
echo("fc_neighbor_favor",{"place":"yard","time":"day","people":3,"props":["grain"]},"family",[P("reputation",5),P("money",-10),P("happiness",2)],
  ("Долг соседке","A debt to the neighbour"),
  ("Соседка, что когда-то кормила тебя, постарела и попросила помочь с урожаем. Ты работал{g:|а} у неё неделю бесплатно. «Сочлись», — сказала она, и вся улица теперь говорит о тебе с уважением.",
   "The neighbour who once fed you has grown old and asked for help with the harvest. You worked for her a week for nothing. \"We're settled,\" she said, and now the whole street speaks of you with respect."))
# 3. Подарок
ev("fc_gift",{"place":"home","time":"day","people":4,"props":["cradle","table"]},"family",[
  {"id":"horse","effects":[P("strength",2),P("risk_tolerance",1)]},
  {"id":"knife","effects":[P("diligence",2)],"delayed_effects":de("fc_gift_hands")},
  {"id":"beads","effects":[P("intellect",2)],"delayed_effects":de("fc_gift_count")}],
  ("Подарки к колыбели","Gifts for the cradle"),
  ("Гости принесли подарки, и по обычаю один кладут в колыбель — «на судьбу»: деревянную лошадку, маленький нож в ножнах или нитку счётных бусин.",
   "Guests brought gifts, and by custom one is laid in the cradle \"for fate\": a wooden horse, a small sheathed knife, or a string of counting beads."),
  {"horse":("Лошадку","The horse","Лошадка легла в колыбель. «Будет непоседой», — смеются гости.","The horse went into the cradle. \"A restless one,\" the guests laugh."),
   "knife":("Нож","The knife","Нож в ножнах положили в изголовье. «Будут умелые руки», — говорит дед.","The sheathed knife lay at the head of the cradle. \"Skilled hands,\" says grandfather."),
   "beads":("Бусины","The beads","Счётные бусины зашуршали у тебя в кулачке. «Будет считать лучше торговца», — шутит отец.","The counting beads rattled in your fist. \"Will count better than a merchant,\" your father jokes.")})
echo("fc_gift_hands",{"place":"workshop","time":"day","people":2,"props":["anvil"]},"work",[P("diligence",4),P("self_esteem",3)],
  ("Умелые руки","Skilled hands"),
  ("Мастер долго смотрел, как ты работаешь, и сказал: «Руки у тебя от рождения». Мать потом вспомнила нож, что положили тебе в колыбель, — и все долго над этим смеялись.",
   "The master watched you work a long time and said: \"You were born with those hands.\" Later your mother remembered the knife laid in your cradle — and everyone laughed about it for a long time."))
echo("fc_gift_count",{"place":"market","time":"day","people":3,"props":["coins"]},"money",[P("intellect",3),P("money",15)],
  ("Счёт в уме","Counting in your head"),
  ("На рынке торговец ошибся в счёте, и ты поправил{g:|а} его быстрее, чем он загнул пальцы. Он рассмеялся и дал тебе монету «за голову». Счётные бусины из колыбели, видно, помогли.",
   "At the market a trader got his sums wrong, and you corrected him faster than he could count on his fingers. He laughed and gave you a coin \"for the head\". The counting beads from the cradle must have helped."))
# 4. Гадалка
ev("fc_fortune",{"place":"yard","time":"sunset","people":3,"props":["fire"]},"life",[
  {"id":"listen","effects":[P("faith",1)],"delayed_effects":de("fc_prophecy")},
  {"id":"pay","requirements":[{"param":"money","op":">=","value":10}],"effects":[P("money",-10),P("happiness",2)],"delayed_effects":de("fc_prophecy_paid")},
  {"id":"chase","effects":[P("self_esteem",1)]}],
  ("Гадалка у ворот","The fortune-teller at the gate"),
  ("У ворот остановилась бродячая гадалка и попросилась взглянуть на младенца. «Скажу, что его ждёт», — говорит она и протягивает руку за монетой.",
   "A wandering fortune-teller stopped at the gate and asked to see the baby. \"I'll tell what awaits it,\" she says, holding out her hand for a coin."),
  {"listen":("Выслушать даром","Listen for free","Гадалка посмотрела на тебя и сказала одно: «Беда придёт по воде — не бойся её». И ушла.","The fortune-teller looked at you and said only: \"Trouble will come by water — do not fear it.\" And she left."),
   "pay":("Заплатить за доброе гадание","Pay for a good fortune","За монету гадалка напророчила тебе долгую жизнь, полный дом и уважение соседей. Мать была счастлива весь вечер.","For a coin she foretold you a long life, a full house and the neighbours' respect. Your mother was happy all evening."),
   "chase":("Прогнать","Send her away","Отец прогнал гадалку. Она что-то пробормотала через плечо, но никто не разобрал что.","Your father sent her away. She muttered something over her shoulder, but no one caught what.")})
echo("fc_prophecy",{"place":"river","time":"overcast","people":2,"props":["boat","rain"]},"life",[P("self_esteem",4),P("stress",-3),P("faith",2)],
  ("Слова гадалки","The fortune-teller's words"),
  ("Переправа пошла не так — лодку понесло, все закричали. А ты вдруг вспомнил{g:|а} рассказ матери про гадалку: «беда придёт по воде — не бойся её». Ты не испугал{g:ся|ась}, и вы выбрались.",
   "The crossing went wrong — the boat was swept away and everyone screamed. And suddenly you remembered your mother's story about the fortune-teller: \"trouble will come by water — do not fear it.\" You did not, and you all got out."))
echo("fc_prophecy_paid",{"place":"home","time":"sunset","people":3,"props":["table"]},"life",[P("happiness",3),P("self_esteem",2),P("stress",2)],
  ("Обещанная судьба","The promised fate"),
  ("Мать до сих пор пересказывает гостям, что гадалка обещала тебе долгую жизнь и полный дом. Ты смеёшься — а про себя считаешь, что пока сбывается не всё.",
   "Your mother still tells guests the fortune-teller promised you a long life and a full house. You laugh — and quietly count how much of it has come true so far."))
# 5. Покровитель
ev("fc_patron",{"place":"temple","time":"day","people":4,"props":["altar","cradle"]},"family",[
  {"id":"rich","effects":[P("reputation",2)],"delayed_effects":de("fc_patron_rich")},
  {"id":"elder","effects":[P("faith",2)],"delayed_effects":de("fc_patron_elder")},
  {"id":"uncle","effects":[P("loneliness",-2)]}],
  ("Кто будет покровителем","Who will be your sponsor"),
  ("По обычаю у ребёнка должен быть старший покровитель — тот, кто поручится за него перед людьми и {faith}. Предлагают богатого соседа, старца при храме или бедного дядю по матери.",
   "By custom a child needs an elder sponsor — someone to vouch for it before people and before {faith}. The choices are a rich neighbour, the old man at the temple, or a poor uncle on your mother's side."),
  {"rich":("Богатого соседа","The rich neighbour","Богатый сосед согласился и подарил серебряную ложку. Мать спрятала её подальше.","The rich neighbour agreed and gave a silver spoon. Your mother hid it away."),
   "elder":("Старца при храме","The old man at the temple","Старец взял тебя на руки и долго молчал. «Этому нужна грамота», — сказал он наконец.","The old man took you in his arms and was silent a long time. \"This one needs letters,\" he said at last."),
   "uncle":("Дядю по матери","Mother's brother","Дядя ничего не подарил, зато плакал от радости. «Я тебя не оставлю», — пообещал он.","Your uncle had nothing to give, but he wept for joy. \"I won't leave you,\" he promised.")})
echo("fc_patron_rich",{"place":"palace","time":"day","people":3,"props":["coins","table"]},"money",[P("money",40),P("reputation",3)],
  ("Слово покровителя","Your sponsor's word"),
  ("Богатый сосед, твой покровитель с колыбели, вспомнил о тебе: замолвил слово, где нужно, и дал денег «на начало». «Я обещал за тебя поручиться — вот и ручаюсь».",
   "The rich neighbour, your sponsor since the cradle, remembered you: he put in a word where it mattered and gave you money \"for a start\". \"I promised to vouch for you — so I do.\""))
echo("fc_patron_elder",{"place":"school","time":"day","people":2,"props":["scroll","lamp"]},"life",[P("intellect",4),P("faith",2)],
  ("Уроки старца","The old man's lessons"),
  ("Старец при храме, когда-то ставший твоим покровителем, позвал тебя и стал учить читать и считать по вечерам. «Я обещал, что у тебя будет грамота», — сказал он.",
   "The old man at the temple, who became your sponsor long ago, called you in and began teaching you to read and count in the evenings. \"I promised you would have letters,\" he said."))
# 6. Сговор
ev("fc_betrothal",{"place":"yard","time":"sunset","people":4,"props":["table","amphora"]},"family",[
  {"id":"agree","effects":[P("reputation",2)],"delayed_effects":de("fc_betrothal_due")},
  {"id":"refuse","effects":[P("self_esteem",1)],"delayed_effects":de("fc_betrothal_grudge")},
  {"id":"later","effects":[]}],
  ("Сговор у колыбели","A cradle betrothal"),
  ("Соседи пришли с угощением: у них тоже родился ребёнок, и они предлагают сговорить детей уже сейчас — «чтобы породниться». Так иногда делают.",
   "The neighbours came with food: they too have a new baby and propose to betroth the children now — \"so our families become kin\". It is sometimes done."),
  {"agree":("Ударить по рукам","Shake on it","Родители ударили по рукам и выпили за будущую свадьбу. Тебе, конечно, никто ничего не сказал.","Your parents shook hands and drank to the future wedding. No one told you anything, of course."),
   "refuse":("Отказаться","Refuse","Отец вежливо отказал. Соседи улыбнулись, но ушли раньше, чем собирались.","Your father politely refused. The neighbours smiled, but left sooner than they meant to."),
   "later":("«Пусть подрастут»","\"Let them grow up\"","«Пусть подрастут, там видно будет», — сказала мать. Все согласились, что это мудро.","\"Let them grow up, then we'll see,\" said your mother. Everyone agreed it was wise.")})
echo("fc_betrothal_due",{"place":"home","time":"sunset","people":4,"props":["table","lamp"]},"family",[P("stress",5),P("reputation",3)],
  ("Старый сговор","The old betrothal"),
  ("Соседи напомнили о сговоре, заключённом у твоей колыбели. Тебя это застало врасплох: выходит, судьбу за тебя решили, когда ты ещё не умел{g:|а} ходить. Родители говорят, что слово надо держать.",
   "The neighbours reminded everyone of the betrothal made at your cradle. It caught you off guard: so your fate was decided before you could walk. Your parents say a word must be kept."))
echo("fc_betrothal_grudge",{"place":"street","time":"overcast","people":3,"props":["tree"]},"family",[P("reputation",-3),P("stress",3)],
  ("Давняя обида","An old grudge"),
  ("Соседи так и не простили отказа, полученного когда-то у твоей колыбели. Их сын теперь при каждом случае задирает тебя, а мать за спиной говорит, что ваша семья слишком высоко себя ставит.",
   "The neighbours never forgave the refusal they got at your cradle. Their son now picks on you at every chance, and his mother says behind your back that your family thinks too much of itself."))
# 7. Зима
ev("fc_winter",{"place":"home","time":"night","people":3,"props":["fire","cradle"]},"money",[
  {"id":"sell","effects":[P("money",-15),P("health",2)],"delayed_effects":de("fc_winter_story")},
  {"id":"relatives","effects":[P("health",1)],"delayed_effects":de("fc_winter_cousins")},
  {"id":"endure","effects":[P("health",-3)]}],
  ("Лютая зима","A bitter winter"),
  ("Зима выдалась такая, что в доме замерзает вода. Младенцу не выжить в холоде. Можно продать что-то ценное и купить топлива, перебраться к родне в тёплый дом или терпеть.",
   "The winter is so cold the water freezes indoors. A baby will not survive the cold. You could sell something valuable for fuel, move in with relatives who have a warm house, or endure."),
  {"sell":("Продать ценное","Sell something valuable","Отец продал лучшее, что было в доме, и всю зиму топили, не жалея. Ты не кашлянул{g:|а} ни разу.","Your father sold the best thing in the house, and all winter the fire burned freely. You never coughed once."),
   "relatives":("Перебраться к родне","Move in with relatives","Всю зиму вы жили у родни: тесно, шумно, зато тепло. Тебя передавали с рук на руки.","All winter you lived with relatives: crowded and noisy, but warm. You were passed from arm to arm."),
   "endure":("Терпеть","Endure","Мать грела тебя своим телом ночи напролёт. Ты пережил{g:|а} зиму, но кашель остался до весны.","Your mother warmed you with her own body night after night. You survived the winter, but the cough lasted until spring.")})
echo("fc_winter_story",{"place":"home","time":"night","people":3,"props":["fire","lamp"]},"family",[P("self_esteem",3),P("happiness",3)],
  ("Цена одной зимы","The price of one winter"),
  ("Однажды вечером отец рассказал, что в год твоего рождения продал самое ценное, что было в доме, лишь бы ты не замёрз{g:|ла}. «Не жалею ни дня», — сказал он. Ты долго не мог{g:|ла} уснуть.",
   "One evening your father told how, in the year you were born, he sold the most valuable thing in the house so you would not freeze. \"I don't regret a single day,\" he said. You lay awake a long time."))
echo("fc_winter_cousins",{"place":"yard","time":"day","people":4,"props":["tree"]},"family",[P("loneliness",-6),P("happiness",3),{"add_npc":"friend","attitude":55}],
  ("Двоюродные","Cousins"),
  ("Та зима у родни сдружила семьи навсегда. Двоюродный родич, с которым вас в младенчестве укладывали в одну люльку, стал тебе ближе многих родных.",
   "That winter with the relatives bound the families for good. A cousin, laid in the same cradle as you when you were babies, became closer to you than a brother."))
# 8. Обет
ev("fc_vow",{"place":"temple","time":"dawn","people":3,"props":["altar","lamp"]},"life",[
  {"id":"pilgrimage","effects":[P("faith",2)],"delayed_effects":de("fc_vow_due")},
  {"id":"donate","requirements":[{"param":"money","op":">=","value":20}],"effects":[P("money",-20),P("faith",1)],"delayed_effects":de("fc_vow_temple")},
  {"id":"none","effects":[]}],
  ("Обет за младенца","A vow for the baby"),
  ("Ты родил{g:ся|ась} слаб{g:ым|ой} и долго не брал{g:|а} грудь. Мать в отчаянии хочет дать обет {faith}: что ты, когда вырастешь, совершишь паломничество, — или сейчас отдать храму часть денег.",
   "You were born weak and would not feed for a long time. In despair your mother wants to make a vow to {faith}: that you will go on a pilgrimage when you are grown — or to give part of your money to the temple now."),
  {"pilgrimage":("Обет паломничества","Vow a pilgrimage","Мать дала обет. Через несколько дней ты начал{g:|а} есть, и в доме решили, что обет услышан.","Your mother made the vow. A few days later you began to feed, and the household decided the vow had been heard."),
   "donate":("Отдать деньги храму","Give money to the temple","Деньги отнесли в храм. Служители обещали молиться за тебя каждый день.","The money went to the temple. The priests promised to pray for you every day."),
   "none":("Обойтись без обета","No vow","«Выкормим сами», — сказала бабушка и взялась за дело. Ты выжил{g:|а} её стараниями.","\"We'll feed it ourselves,\" said grandmother, and set to work. You lived thanks to her.")})
echo("fc_vow_due",{"place":"road","time":"dawn","people":2,"props":["cart"]},"life",[P("faith",5),P("money",-20),P("happiness",4),P("stress",-3)],
  ("Исполнить обет","Keeping the vow"),
  ("Мать напомнила: когда ты был{g:|а} младенцем, она дала обет, что ты совершишь паломничество. Ты собрал{g:ся|ась} в дорогу. Путь был долгим и дорогим, но домой ты вернул{g:ся|ась} другим человеком.",
   "Your mother reminded you: when you were a baby she vowed you would go on a pilgrimage. You set out. The road was long and costly, but you came home a different person."))
echo("fc_vow_temple",{"place":"temple","time":"day","people":3,"props":["altar"]},"life",[P("reputation",4),P("faith",2)],
  ("Храм помнит","The temple remembers"),
  ("Служитель в храме нашёл твоё имя в старых записях: «За этого ребёнка молились каждый день». Теперь в храме к тебе относятся как к своему.",
   "A priest at the temple found your name in the old records: \"This child was prayed for every day.\" Now the temple treats you as one of its own."))

# Родители, упомянутые в тексте, должны быть живы (иначе событие не случится).
import re
ROLE={'father':r'(^|[^а-яё])(отец|отца|отцу|отцом|отце|папа|папы|папе)([^а-яё]|$)','mother':r'(^|[^а-яё])(мать|матери|матерью|мама|мамы|маме|маму|мамой)([^а-яё]|$)'}
for e in events:
    text=' '.join(v for k,v in ru.items() if k.startswith(f"ev.{e['id']}.")).lower()
    conds=[{"has_npc":r} for r,rx in ROLE.items() if re.search(rx,text)]
    if conds: e["conditions"]=conds
json.dump(events, open(ROOT+'events_first.json','w'), ensure_ascii=False, indent=1)
for lang,d in [('ru',ru),('en',en)]:
    json.dump(d, open(ROOT+f'{lang}_first.json','w'), ensure_ascii=False, indent=2)
print(len(events), len(ru))
