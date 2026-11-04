# Отчёт по балансу «Руслания Лайт» (v1, ур. 1 и 5)

Инструмент: `node tools/sim/balance.mjs --mode party|solo|races|prologue|all [--level 1|5] [--n N] [--seed S] [--only classId]`.
Финал: сим A n=800 партий×33 билда, seed 11; соло n=300; пролог n=150 на билд; расы n=120. Шум одного значения вклада ±3.5 п.п. (95%); цели ±5 п.п. на границе разрешающей способности.
Журнал правок: `docs/balance/CHANGELOG.md`.

## Итог
| Цель спеки | До | После |
|---|---|---|
| Победы партии 55–65% | — | party1 66%, party5 60% |
| Вклад пути в ±5 п.п. | вне ±5: 16/33 (ур.1), 26/33 (ур.5) | вне: 6/33 (ур.1), 10/33 (ур.5); rms 9.2/10.5 → 3.9/4.4 |
| Расы ±5 п.п. | — | в основном да (см. ниже), шум ±8 |
| Соло 40–70% core-ролей, ≥20% саппорт/контроль | см. ниже | ур.1: 10 вне; ур.5: ~15 вне |
| Пролог (соло ур.1) 85–90 / 75–85 / 65–80, ни один класс <55% на p3 | ≈100/100/100 (после правок движка 75/86/94) | 79 / 86 / 83; минимум p3 — СлавоТех 55% |

## Сим A, ур.1 (было → стало), вклад класса, п.п.
| Класс | до | после |
|---|---|---|
| Забивной | +6.6 | +1.2 |
| Техномант | −20.5 | −0.7 |
| Мутант | +3.8 | −1.2 |
| Айтишник | +16.2 | +2.6 |
| Рейнджер | −2.5 | −2.5 |
| Арбитр | −0.2 | +2.3 |
| Уголовник | −5.1 | −1.9 |
| Эколог | +4.2 | +3.3 |
| Рэпер | −4.9 | −2.9 |
| СлавоТех | +4.4 | +4.8 |
| КиберТех | −2.0 | −5.1 |

## Сим A, ур.5 (было → стало)
| Класс | до | после |
|---|---|---|
| Забивной | −2.3 | −2.2 |
| Техномант | +12.3 | +1.8 |
| Мутант | −9.9 | −2.6 |
| Айтишник | +4.5 | −5.5 |
| Рейнджер | −11.5 | +0.3 |
| Арбитр | +2.8 | −0.5 |
| Уголовник | −11.2 | +1.8 |
| Эколог | −2.6 | −3.3 |
| Рэпер | −5.7 | +0.3 |
| СлавоТех | +12.1 | +4.3 |
| КиберТех | +11.4 | +5.6 |

## Вклад путей — финал (п.п.)
```
--- ур.1, party1 ---
=== Sim A: party vs party1  (n=800 trios x builds, seed 11); party winrate avg  66%  ===
zabivnoy    [tank   ] class  67% contrib   +1.2
   mech-killer                {melee  }  69% contrib   +2.5 
   wasteland-sniper           {ranged }  66% contrib   -0.3 
   iron-titan                 {tank   }  68% contrib   +1.5 
technomant  [caster ] class  65% contrib   -0.7
   coder                      {control}  60% contrib   -5.9 (вне ±5)
   illusionist                {control}  66% contrib   +0.2 
   energetic                  {caster }  70% contrib   +3.6 
mutant      [melee  ] class  65% contrib   -1.2
   beast                      {melee  }  65% contrib   -1.0 
   titan                      {tank   }  64% contrib   -2.4 
   predator                   {melee  }  66% contrib   -0.3 
itishnik    [support] class  69% contrib   +2.6
   inventor                   {support}  71% contrib   +4.3 
   sapper                     {control}  67% contrib   +0.8 
   mechanic                   {support}  69% contrib   +2.6 
ranger      [ranged ] class  64% contrib   -2.5
   hunter                     {ranged }  66% contrib   +0.2 
   survivor                   {tank   }  62% contrib   -3.8 
   saboteur                   {control}  62% contrib   -3.8 
arbiter     [tank   ] class  69% contrib   +2.3
   defender                   {tank   }  70% contrib   +3.3 
   avenger                    {melee  }  69% contrib   +2.8 
   judge                      {control}  67% contrib   +0.8 
ugolovnik   [melee  ] class  64% contrib   -1.9
   breaker                    {melee  }  66% contrib   +0.1 
   ghost                      {melee  }  65% contrib   -1.4 
   manipulator                {melee  }  62% contrib   -4.3 
ecolog      [control] class  70% contrib   +3.3
   nature                     {control}  70% contrib   +3.8 
   spirits                    {control}  69% contrib   +2.8 
   techno-shaman              {control}  70% contrib   +3.3 
reper       [support] class  63% contrib   -2.9
   inspirer                   {support}  70% contrib   +4.2 
   manipulator                {support}  61% contrib   -5.7 (вне ±5)
   techno-musician            {support}  59% contrib   -7.3 (вне ±5)
slavotech   [support] class  71% contrib   +4.8
   healing                    {support}  72% contrib   +5.7 (вне ±5)
   balance                    {support}  70% contrib   +3.3 
   proxy-master               {support}  72% contrib   +5.5 (вне ±5)
cybertech   [caster ] class  61% contrib   -5.1
   soul-eater                 {caster }  61% contrib   -4.8 
   cyber-demon                {caster }  66% contrib   -0.5 
   curses                     {caster }  56% contrib   -9.9 (вне ±5)
paths out of ±5pp: 6/33; rms 3.9pp; noise per build ≈ ±3.5pp (95%)
(310.4s)
--- ур.5, party5 ---
=== Sim A: party vs party5  (n=800 trios x builds, seed 11); party winrate avg  60%  ===
zabivnoy    [tank   ] class  58% contrib   -2.2
   mech-killer                {melee  }  60% contrib   -0.1 
   wasteland-sniper           {ranged }  55% contrib   -5.3 (вне ±5)
   iron-titan                 {tank   }  59% contrib   -1.1 
technomant  [caster ] class  62% contrib   +1.8
   coder                      {control}  64% contrib   +3.9 
   illusionist                {control}  58% contrib   -2.1 
   energetic                  {caster }  64% contrib   +3.6 
mutant      [melee  ] class  57% contrib   -2.6
   beast                      {melee  }  55% contrib   -5.5 (вне ±5)
   titan                      {tank   }  62% contrib   +1.9 
   predator                   {melee  }  56% contrib   -4.3 
itishnik    [support] class  55% contrib   -5.5
   inventor                   {support}  53% contrib   -7.3 (вне ±5)
   sapper                     {control}  58% contrib   -2.3 
   mechanic                   {support}  53% contrib   -7.1 (вне ±5)
ranger      [ranged ] class  60% contrib   +0.3
   hunter                     {ranged }  64% contrib   +3.4 
   survivor                   {tank   }  62% contrib   +1.5 
   saboteur                   {control}  56% contrib   -4.0 
arbiter     [tank   ] class  60% contrib   -0.5
   defender                   {tank   }  65% contrib   +5.0 
   avenger                    {melee  }  60% contrib   -0.4 
   judge                      {control}  54% contrib   -6.0 (вне ±5)
ugolovnik   [melee  ] class  62% contrib   +1.8
   breaker                    {melee  }  67% contrib   +6.4 (вне ±5)
   ghost                      {melee  }  60% contrib   -0.6 
   manipulator                {melee  }  60% contrib   -0.4 
ecolog      [control] class  57% contrib   -3.3
   nature                     {control}  62% contrib   +2.2 
   spirits                    {control}  52% contrib   -7.9 (вне ±5)
   techno-shaman              {control}  56% contrib   -4.1 
reper       [support] class  60% contrib   +0.3
   inspirer                   {support}  65% contrib   +4.7 
   manipulator                {support}  59% contrib   -0.9 
   techno-musician            {support}  57% contrib   -3.0 
slavotech   [support] class  64% contrib   +4.3
   healing                    {support}  64% contrib   +3.9 
   balance                    {support}  67% contrib   +6.7 (вне ±5)
   proxy-master               {support}  63% contrib   +2.4 
cybertech   [caster ] class  66% contrib   +5.6
   soul-eater                 {caster }  66% contrib   +6.1 (вне ±5)
   cyber-demon                {caster }  66% contrib   +5.7 (вне ±5)
   curses                     {caster }  65% contrib   +5.0 
paths out of ±5pp: 10/33; rms 4.4pp; noise per build ≈ ±3.5pp (95%)
(359.0s)
```

## Сим B, соло (финал)
```

=== Sim B: solo vs standard1 (n=300, races rotate, seed 11) ===
zabivnoy/mech-killer                     {melee  }  58%
zabivnoy/wasteland-sniper                {ranged }  60%
zabivnoy/iron-titan                      {tank   }  64%
technomant/coder                         {control}  25%
technomant/illusionist                   {control}  36%
technomant/energetic                     {caster }  15% (вне цели)
mutant/beast                             {melee  }  42%
mutant/titan                             {tank   }  47%
mutant/predator                          {melee  }  43%
itishnik/inventor                        {support}  42%
itishnik/sapper                          {control}  15% (вне цели)
itishnik/mechanic                        {support}  17% (вне цели)
ranger/hunter                            {ranged }  60%
ranger/survivor                          {tank   }  53%
ranger/saboteur                          {control}  48%
arbiter/defender                         {tank   }  66%
arbiter/avenger                          {melee  }  51%
arbiter/judge                            {control}  37%
ugolovnik/breaker                        {melee  }  58%
ugolovnik/ghost                          {melee  }  50%
ugolovnik/manipulator                    {melee  }  45%
ecolog/nature                            {control}  50%
ecolog/spirits                           {control}  51%
ecolog/techno-shaman                     {control}  17% (вне цели)
reper/inspirer                           {support}  18% (вне цели)
reper/manipulator                        {support}  37%
reper/techno-musician                    {support}  26%
slavotech/healing                        {support}  11% (вне цели)
slavotech/balance                        {support}  29%
slavotech/proxy-master                   {support}  17% (вне цели)
cybertech/soul-eater                     {caster }  35% (вне цели)
cybertech/cyber-demon                    {caster }  44%
cybertech/curses                         {caster }  32% (вне цели)

=== Sim B: solo vs standard5 (n=300, races rotate, seed 11) ===
zabivnoy/mech-killer                     {melee  }  70% (вне цели)
zabivnoy/wasteland-sniper                {ranged }  56%
zabivnoy/iron-titan                      {tank   }  74% (вне цели)
technomant/coder                         {control}  38%
technomant/illusionist                   {control}  15% (вне цели)
technomant/energetic                     {caster }  32% (вне цели)
mutant/beast                             {melee  }  68%
mutant/titan                             {tank   }  89% (вне цели)
mutant/predator                          {melee  }  78% (вне цели)
itishnik/inventor                        {support}  35%
itishnik/sapper                          {control}   7% (вне цели)
itishnik/mechanic                        {support}   4% (вне цели)
ranger/hunter                            {ranged }  73% (вне цели)
ranger/survivor                          {tank   }  63%
ranger/saboteur                          {control}  81%
arbiter/defender                         {tank   }  78% (вне цели)
arbiter/avenger                          {melee  }  45%
arbiter/judge                            {control}  27%
ugolovnik/breaker                        {melee  }  76% (вне цели)
ugolovnik/ghost                          {melee  }  82% (вне цели)
ugolovnik/manipulator                    {melee  }  69%
ecolog/nature                            {control}  17% (вне цели)
ecolog/spirits                           {control}  29%
ecolog/techno-shaman                     {control}  44%
reper/inspirer                           {support}  90%
reper/manipulator                        {support}  86%
reper/techno-musician                    {support}  72%
slavotech/healing                        {support}  23%
slavotech/balance                        {support}  34%
slavotech/proxy-master                   {support}   1% (вне цели)
cybertech/soul-eater                     {caster }  25% (вне цели)
cybertech/cyber-demon                    {caster }  30% (вне цели)
cybertech/curses                         {caster }  23% (вне цели)

(82.1s)
```

Соло до правок (standard1/5, по ролям): вне цели было 21 билд; у Техноманта-энергетика 8%, СлавоТех-лекаря 14%/8%, Мутанта-титана 95% (ур.5), Забивного 72–88%.

## Пролог (соло ур.1, расы и пути перебираются)
```

=== Prologue maps: solo level-1 hero, class x path x races rotating (n=150 per build, seed 11) ===
prologue-1: avg  79%
prologue-2: avg  86%
prologue-3: avg  83%
class         prologue-1  prologue-2  prologue-3
zabivnoy             91%         80%         90%
technomant           72%         84%         90%
mutant               90%         94%         87%
itishnik             73%         79%         91%
ranger               96%         89%         88%
arbiter              80%         93%         76%
ugolovnik            92%         91%         76%
ecolog               76%         95%         98%
reper                72%         61%         69%
slavotech            64%         93%         55%
cybertech            71%         93%         94%

(70.4s)
```

## Влияние рас (вклад кандидата, п.п. к среднему по классу; n=120, шум ±8)
```
=== Races: party vs party1, effect of race on candidate (pp vs class mean), n=120 ===
zabivnoy   human   +1.3 | skeleton   +1.1 | android   -1.2 | mutant-be   +0.2 | mutant-pl   -1.4
technomant human   +0.6 | skeleton   +0.3 | android   +3.6 | mutant-be   -2.8 | mutant-pl   -1.7
mutant     human   -3.3 | mutant-be   +6.1 | mutant-pl   -2.8
itishnik   human   -3.7 | skeleton   +0.8 | android   +3.6 | mutant-be   +1.1 | mutant-pl   -1.7
ranger     human   +3.8 | skeleton   +5.8 | android   -3.4 | mutant-be   -5.3 | mutant-pl   -0.9
arbiter    human   -4.4 | skeleton   +0.6 | android   +1.2 | mutant-be   +3.4 | mutant-pl   -0.8
ugolovnik  human   +3.7 | skeleton   +7.9 | android   -3.2 | mutant-be   -3.8 | mutant-pl   -4.6
ecolog     human   +0.4 | skeleton   -0.7 | mutant-be   +3.7 | mutant-pl   -3.5
reper      human   -5.9 | skeleton   +3.2 | android   -3.2 | mutant-be   +1.0 | mutant-pl   +4.9
slavotech  human   -8.0 | skeleton   +2.3 | mutant-be   +3.4 | mutant-pl   +2.3
cybertech  human   -1.7 | skeleton   +4.9 | mutant-be   +0.2 | mutant-pl   -3.4
race mean effect: human -1.6 | skeleton +2.6 | android -0.4 | mutant-beast +0.7 | mutant-plant -1.2
(227.3s)
=== Races: party vs party5, effect of race on candidate (pp vs class mean), n=120 ===
zabivnoy   human   +4.7 | skeleton   +0.3 | android   -1.1 | mutant-be   +1.9 | mutant-pl   -5.8
technomant human   -4.6 | skeleton   +1.6 | android   +4.1 | mutant-be   +0.7 | mutant-pl   -1.8
mutant     human   -2.6 | mutant-be   +7.7 | mutant-pl   -5.1
itishnik   human   -3.8 | skeleton   +0.6 | android   +5.9 | mutant-be   -0.5 | mutant-pl   -2.2
ranger     human   +5.3 | skeleton   +5.3 | android   -1.1 | mutant-be   -4.7 | mutant-pl   -4.9
arbiter    human   -2.3 | skeleton   -4.0 | android   +2.1 | mutant-be   +6.6 | mutant-pl   -2.3
ugolovnik  human   -1.5 | skeleton   +5.4 | android   -2.1 | mutant-be   -0.1 | mutant-pl   -1.8
ecolog     human   -0.7 | skeleton   +0.1 | mutant-be   +0.7 | mutant-pl   -0.1
reper      human   +5.7 | skeleton   -3.5 | android   -0.4 | mutant-be   +0.1 | mutant-pl   -1.8
slavotech  human   +3.1 | skeleton   -3.8 | mutant-be   +3.7 | mutant-pl   -3.0
cybertech  human   -1.5 | skeleton   +3.7 | mutant-be   +1.5 | mutant-pl   -3.7
race mean effect: human +0.2 | skeleton +0.6 | android +1.1 | mutant-beast +1.6 | mutant-plant -3.0
(262.9s)
```

Выводы по расам: среднее влияние расы на партию в пределах −3…+2.6 п.п. (цель ±5). Заметны: Мутант-зверь на классе Мутант +6…+8 (бонус СИЛ на СИЛ-классе), Скелет у Рейнджера/Уголовника +5…+8 на ур.1, Мутант-растение −3 на ур.5 (скорость 5). Правок рас не делал: значения на границе шума. Если понадобится: мутант-растение speed 5→6 или hpBonus +1.

## Что не достигнуто и почему
1. **Соло-цели.** Один набор `standard1/5` не может дать 40–70% и лёгким мартиалам, и хрупким кастерам: мартиалы (Забивной, Уголовник, Мутант-титан на ур.5) 70–89%, AoE/саппорт-билды (Энергетик, Сапёр, Механик, СлавоТех-прокси, Эколог-природа на ур.5) 1–17%. Правка кастеров вверх ломает их вклад в партии. Предлагаю принять соло как справочную метрику (по спеке) и сдвигать соло-цели по ролям.
2. **Вклад путей ±5 п.п.**: 6/33 и 10/33 вне, но при шуме ±3.5 п.п. часть — шум. Устойчиво вне: Проклятия КиберТеха ур.1 (−10), Техно-Музыкант/Манипулятор Рэпера ур.1 (−6…−7), СлавоТех-лечение/прокси ур.1 (+6), Дух Эколога ур.5 (−8), Изобретатель/Механик ур.5 (−7), КиберТех ур.5 (+6) при −5 на ур.1 — разная форма кривой: у класса сильные способности ур.5 (AoE, drain), слабый старт.
3. **Пролог:** p1 79% (цель 85–90), p3 83% (цель 65–80): враги общие с партийными боями, а у СлавоТеха/Рэпера соло против босса 55–69%. Дальше упирается в то, что состав карт нельзя менять; можно завести отдельных `acolyte-p3`/`cultist-p1`, но карты ссылаются на id.
4. **Партия ур.1 66%** — на границе. Состав дискретный: +1 враг даёт −15…−20 п.п.
5. **Правила, мешающие балансу:** (а) `range:0, target:'tile'` ИИ не использует; (б) прокси-урон ×0.5 по живым делает Прокси-Мастера слабым соло против культа (лор, оставлено); (в) суммоны не масштабируются уровнем (дрон/турель одинаковы на ур.1 и 5), поэтому Изобретатель на ур.5 получил отдельного меха; (г) кринж против боссов не «ломает» (по правилам), против тварей без психики (`NO_MIND`) бесполезен.

## Мир v1.0: бои `w-*` (партия из 4 своего уровня; случайные классы, пути, расы, боевые таланты и примочка)
Команда: `node tools/sim/balance.mjs --mode world [--size 2] [--no-talents] --n 800 --seed 71`. Таланты: до `COMBAT_TALENT_LIMIT` случайных боевых из слотов race/job/faction/alignment (с вероятностью 0.75 на слот), примочка `gadgetFor(cls)`. Компаньоны не моделировались.
Цели: обычные 75–90%, квесты и терминалы 65–80%, элита 60–70%, финал без снятых терминалов 40–50%, со всеми снятыми 70–80%; партия из 2 — 60–80% на обычных.

### Итог
| Цель | Было (до правок, `power` отсутствует) | Стало |
|---|---|---|
| Обычные 75–90% | 100% во всех | 82–90%, все в цели (n=800, шум ±2.5) |
| Квесты/терминалы 65–80% | 100% | 68–77%, все в цели |
| Элита 60–70% | 100% | checkpoint 69%, svoboda-raid 64% |
| Финал 0 снято 40–50% | 32% (8 врагов) | 45% |
| Финал все сняты 70–80% | 100% | 68% (на 2 п.п. ниже цели) |
| Партия из 2, обычные 60–80% | не считалось | 64–74% в цели у 7 из 13; выше цели — cult-cell 83, jesters 100, hatch 85, cyberspace 86; ниже — cc-gate 53, cc-dead 59 |

### Партия из 4 с талантами и примочками (n=800)
```
=== World: party of 4 (random combat talents + gadget), n=800, seed 71 ===
w-harmony-riot                     L1 foes  6 normal win  86% rounds  7.1  target 75-90
w-harmony-cult-cell                L1 foes  6 normal win  82% rounds  7.8  target 75-90
w-road-crawlers                    L1 foes  4 normal win  84% rounds  6.9  target 75-90
w-road-scavengers                  L2 foes  6 normal win  88% rounds  8.8  target 75-90
w-road-pirates                     L2 foes  4 normal win  90% rounds  8.5  target 75-90
w-villages-jesters                 L1 foes  4 normal win  88% rounds 10.5  target 75-90
w-villages-beacon                  L2 foes  6 quest  win  68% rounds 17.4  target 65-80
w-villages-hatch                   L2 foes  4 normal win  87% rounds 12.9  target 75-90
w-agro-burning-field               L2 foes  6 normal win  83% rounds  9.7  target 75-90
w-villages-terminal                L2 foes  6 quest  win  71% rounds  9.1  target 65-80
w-agro-cleaners                    L2 foes  4 normal win  85% rounds 10.4  target 75-90
w-agro-checkpoint                  L3 foes  6 elite  win  69% rounds 13.2  target 60-70
w-agro-rebels                      L2 foes  6 normal win  87% rounds  7.9  target 75-90
w-agro-svoboda-raid                L3 foes  6 elite  win  64% rounds 11.4  target 60-70
w-agro-terminal                    L3 foes  6 quest  win  70% rounds 10.2  target 65-80
w-cc-gate                          L4 foes  4 normal win  86% rounds 11.0  target 75-90
w-cc-dead                          L3 foes  4 normal win  89% rounds 16.4  target 75-90
w-cc-duel                          L3 foes  4 quest  win  74% rounds 11.0  target 65-80
w-cc-terminal                      L4 foes  4 quest  win  77% rounds 11.2  target 65-80
w-cc-finale 0 terminals off        L5 foes  9 normal win  45% rounds 22.1  target 40-50
w-cc-finale all off (reduce)       L5 foes  4 normal win  68% rounds 20.4  target 70-80
w-cyberspace                       L2 foes  4 normal win  88% rounds 10.0  target 75-90
```

### Партия из 2 (n=500)
```
=== World: party of 2 (random combat talents + gadget), n=500, seed 71 ===
w-harmony-riot                     L1 foes  3 normal win  74% rounds  6.9  target 60-80
w-harmony-cult-cell                L1 foes  3 normal win  83% rounds  7.6  target 60-80 <-- TOO EASY
w-road-crawlers                    L1 foes  2 normal win  72% rounds  6.3  target 60-80
w-road-scavengers                  L2 foes  3 normal win  64% rounds  8.8  target 60-80
w-road-pirates                     L2 foes  2 normal win  72% rounds  8.3  target 60-80
w-villages-jesters                 L1 foes  2 normal win 100% rounds  8.1  target 60-80 <-- TOO EASY
w-villages-beacon                  L2 foes  3 quest  win  29% rounds 16.3  target -
w-villages-hatch                   L2 foes  2 normal win  85% rounds  6.5  target 60-80 <-- TOO EASY
w-agro-burning-field               L2 foes  3 normal win  73% rounds  8.7  target 60-80
w-villages-terminal                L2 foes  3 quest  win  48% rounds  8.3  target -
w-agro-cleaners                    L2 foes  2 normal win  78% rounds  9.1  target 60-80
w-agro-checkpoint                  L3 foes  3 elite  win  43% rounds 13.5  target -
w-agro-rebels                      L2 foes  3 normal win  78% rounds  7.2  target 60-80
w-agro-svoboda-raid                L3 foes  3 elite  win  36% rounds 10.6  target -
w-agro-terminal                    L3 foes  3 quest  win  65% rounds  8.8  target -
w-cc-gate                          L4 foes  2 normal win  53% rounds 11.6  target 60-80 <-- TOO HARD
w-cc-dead                          L3 foes  2 normal win  59% rounds 14.3  target 60-80
w-cc-duel                          L3 foes  2 quest  win  60% rounds  8.7  target -
w-cc-terminal                      L4 foes  2 quest  win  48% rounds 11.3  target -
w-cc-finale 0 terminals off        L5 foes  5 normal win   0% rounds  7.6  target 60-80 <-- TOO HARD
w-cc-finale all off (reduce)       L5 foes  2 normal win  14% rounds 22.4  target 60-80 <-- TOO HARD
w-cyberspace                       L2 foes  2 normal win  86% rounds 10.5  target 60-80 <-- TOO EASY
```

### Партия из 4 без талантов и примочек (n=400)
```
=== World: party of 4 (no talents/gadgets), n=400, seed 71 ===
w-harmony-riot                     L1 foes  6 normal win  80% rounds  7.4  target 75-90
w-harmony-cult-cell                L1 foes  6 normal win  72% rounds  8.1  target 75-90 <-- TOO HARD
w-road-crawlers                    L1 foes  4 normal win  74% rounds  7.3  target 75-90
w-road-scavengers                  L2 foes  6 normal win  80% rounds  9.3  target 75-90
w-road-pirates                     L2 foes  4 normal win  83% rounds  8.9  target 75-90
w-villages-jesters                 L1 foes  4 normal win  86% rounds 10.7  target 75-90
w-villages-beacon                  L2 foes  6 quest  win  59% rounds 17.8  target 65-80 <-- TOO HARD
w-villages-hatch                   L2 foes  4 normal win  74% rounds 14.7  target 75-90
w-agro-burning-field               L2 foes  6 normal win  78% rounds 11.0  target 75-90
w-villages-terminal                L2 foes  6 quest  win  62% rounds  9.5  target 65-80 <-- TOO HARD
w-agro-cleaners                    L2 foes  4 normal win  82% rounds 11.2  target 75-90
w-agro-checkpoint                  L3 foes  6 elite  win  62% rounds 12.9  target 60-70
w-agro-rebels                      L2 foes  6 normal win  82% rounds  7.9  target 75-90
w-agro-svoboda-raid                L3 foes  6 elite  win  56% rounds 11.6  target 60-70 <-- TOO HARD
w-agro-terminal                    L3 foes  6 quest  win  61% rounds 10.0  target 65-80 <-- TOO HARD
w-cc-gate                          L4 foes  4 normal win  77% rounds 12.1  target 75-90
w-cc-dead                          L3 foes  4 normal win  82% rounds 18.1  target 75-90
w-cc-duel                          L3 foes  4 quest  win  60% rounds 11.6  target 65-80 <-- TOO HARD
w-cc-terminal                      L4 foes  4 quest  win  67% rounds 11.6  target 65-80
w-cc-finale 0 terminals off        L5 foes  9 normal win  24% rounds 20.6  target 40-50 <-- TOO HARD
w-cc-finale all off (reduce)       L5 foes  4 normal win  59% rounds 21.3  target 70-80 <-- TOO HARD
w-cyberspace                       L2 foes  4 normal win  84% rounds 10.0  target 75-90
```

### Влияние талантов и примочек
Таланты (до 2–3 боевых) и примочка дают партии из 4 **+6…+15 п.п.** (бой с таким же составом без них: обычные 72–86%, квесты 59–67%, финал 24% / 59%). Спека называет боевой талант ≈ +3–5 п.п., примочку «как один талант», то есть ожидаемо около +9…+15 п.п. на героя при трёх источниках, и это в целом сходится. Конкретных поломов (талант, дающий игре победу сам по себе) в сим не искал: для этого нужен отдельный замер вклада каждого таланта парной заменой (`--mode party` расширить на таланты). Замечание: вклад заметно растёт с уровнем боя (финал +21 п.п. против +6…+10 на ур.1–2), потому что на ур.4 лимит талантов вырастает до трёх.

### Что не достигнуто и почему
1. **Партия из 2.** Правило `ceil(n·s/4)` даёт для двух героев `n/2` врагов: ядро (первые враги) вместо всей группы. Состав из 4 или 6 врагов выравнивает пропорцию, но бои, где ядро — босс или тяжёлый враг (`w-villages-beacon`: маяк, `w-agro-checkpoint`: капитан, `w-agro-svoboda-raid`), для двух героев выходят на 29–43% (для них цель партии из 2 не задана). Финал при партии из 2 невозможен (0% / 14%): ядро (жрец + аколит) слишком сильно для двух героев. Предложение: для финала требовать партию ≥3 или добавить союзников из `finaleMods`; либо правило для s<4 — не брать боссов.
2. **Длина боёв.** Чтобы дотянуть бой до 75–90% без толп, врагам пришлось дать ×2–3 ЗДР. Боёв по 8–17 раундов: `w-villages-beacon` 17, `w-cc-dead` 16, финал 20–22, `w-villages-hatch` 13. Причина — низкий урон героев по сравнению с ЗДР (ур.1–3 герои бьют ~5–8 за ход). Если это слишком долго для UI, нужно поднимать урон героев (не в этой задаче) или заменить толстых врагов числом.
3. **Крутизна порога.** `power` влияет на результат скачком: +0.05 даёт до ±20 п.п. из-за округления атаки и урона. Подобрано массивом `power` ([2.25, 2.24]) там, где нужно промежуточное значение. Дальнейшая правка составов — осторожно, перемерять.
4. **Финал со всеми снятыми** 68% против 70–80%: ниже цели на 2 п.п. (шум ±2).
5. **Партия без талантов** на квестах и элите в 3–10 п.п. ниже цели. Если игрок будет играть без выбора талантов, бои станут жёстче; сейчас баланс настроен на героя с талантами.
6. **Компаньоны** (`recruitables`, блок `companion`) в сим не включены: нужны правила набора партии.
