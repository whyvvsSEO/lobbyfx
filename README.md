# LobbyFX

**[Українська](#українська) · [English](#english) · [Русский](#русский)**

---

## Українська

### LobbyFX — фони та теми для FACEIT

Розширення для Chrome: свої фони, теми інтерфейсу та звук знаходження матчу на **faceit.com**.

> Неофіційно, не пов'язано з FACEIT. Працює лише на faceit.com і нікуди не надсилає дані. Гру, клієнт і античит не зачіпає.

#### Можливості

- **Бібліотека** — твої фони: посилання (YouTube, Tenor, Giphy, .gif/.mp4/.png) і файли до 60 МБ. Улюблені, пошук, фільтри, перейменування.
- **Майстерня** — готові живі фони (YouTube), нові підтягуються з GitHub-репозиторію `lobbyfx-workshop`.
- **Теми** — змінюють кнопки, панелі, кольори, шрифти.
- **Інтерфейс** — свій колір акценту, свій текст на кнопці пошуку матчу, приховування місій, Prestige Path, місця в рейтингу, магазину й банерів.
- **Матч** — свій звук знаходження матчу (3 вбудовані, свій файл або посилання, зокрема з myinstants.com) і автоприйом матчу з випадковою затримкою, лише коли ти за ПК.
- **Фони для сторінок** — окремо для кожної з 17 сторінок FACEIT (лобі, матчрум, Track, історія матчів, профіль…) або для всіх одразу.
- **YouTube** — назва й прев'ю відео підтягуються автоматично.
- **Ротація** — новий фон при кожному вході в лобі або кожні N секунд, з плавним переходом.
- **Резервна копія** — експорт та імпорт усього в один файл.
- **Мови** — українська, English, русский.

#### Встановлення

1. `chrome://extensions` → увімкни **Режим розробника**.
2. **Завантажити розпаковане розширення** → вибери цю папку.
3. Закріпи іконку LobbyFX на панелі.

#### Майстерня

Каталог живе в окремому репозиторії `lobbyfx-workshop` (шаблон додається).
У `lib/store.js` заміни `YOUR_GITHUB` у `WORKSHOP_CATALOG` на свій нік.

#### Звук матчу

FACEIT не повідомляє, який саме звук — «матч знайдено», тому розширення запам'ятовує звуки, які грає сторінка.
Знайди матч один раз → відкрий вкладку **Матч** → натисни «Це звук матчу» біля потрібного.

#### Автоприйом

Вимкнений за замовчуванням. Шукає кнопку «Прийняти» у вікні знайденого матчу й натискає її з випадковою затримкою. Може пропускати матч, якщо ти не торкався миші й клавіатури довше заданого часу. Використовуєш на свій ризик — перевір правила FACEIT.

#### Конфіденційність

Усе зберігається лише у твоєму браузері. Деталі — у [PRIVACY.md](PRIVACY.md) і на сторінці «Правила та конфіденційність» у налаштуваннях розширення.

#### Ліцензія

MIT. Звуки в `sounds/` згенеровані для LobbyFX. Відео в Майстерні належать їхнім авторам на YouTube і показуються через офіційний вбудований плеєр YouTube. За фони та звуки, які додає користувач, відповідає користувач.

---

## English

### LobbyFX — backgrounds & themes for FACEIT

A Chrome extension: your own backgrounds, interface themes and match-found sound on **faceit.com**.

> Unofficial, not affiliated with FACEIT. Works only on faceit.com and never sends your data anywhere. It does not touch the game, the client or the anti-cheat.

#### Features

- **Library** — your backgrounds: links (YouTube, Tenor, Giphy, .gif/.mp4/.png) and files up to 60 MB. Favourites, search, filters, renaming.
- **Workshop** — ready-made live backgrounds (YouTube); new ones are pulled from the `lobbyfx-workshop` GitHub repository.
- **Themes** — restyle buttons, panels, colours and fonts.
- **Interface** — your own accent colour, custom Find match button text, hide missions, Prestige Path, leaderboard position, shop and banners.
- **Match** — custom match-found sound (3 built-in, your own file or a link, e.g. from myinstants.com) and auto-accept with a random delay, only while you are at your PC.
- **Per-page backgrounds** — separately for each of 17 FACEIT pages (lobby, match room, Track, match history, profile…) or for all at once.
- **YouTube** — the video title and preview are fetched automatically.
- **Rotation** — a new background each time you enter the lobby or every N seconds, with a smooth crossfade.
- **Backup** — export and import everything as one file.
- **Languages** — Українська, English, Русский.

#### Installation

1. Open `chrome://extensions` → turn on **Developer mode**.
2. **Load unpacked** → select this folder.
3. Pin the LobbyFX icon to the toolbar.

#### Workshop

The catalogue lives in a separate repository, `lobbyfx-workshop` (template included).
In `lib/store.js`, replace `YOUR_GITHUB` in `WORKSHOP_CATALOG` with your GitHub username.

#### Match sound

FACEIT does not say which sound means “match found”, so the extension remembers the sounds the page plays.
Find a match once → open the **Match** tab → click “This is the match sound” next to the right one.

#### Auto-accept

Off by default. It looks for the Accept button in the match-found popup and clicks it after a random delay. It can skip the match if you have not touched the mouse or keyboard for longer than the time you set. Use at your own risk — check the FACEIT rules.

#### Privacy

Everything is stored only in your browser. Details are in [PRIVACY.md](PRIVACY.md) and on the “Rules & privacy” page in the extension settings.

#### License

MIT. The sounds in `sounds/` were generated for LobbyFX. Workshop videos belong to their authors on YouTube and are shown through the official YouTube embedded player. Users are responsible for the backgrounds and sounds they add.

---

## Русский

### LobbyFX — фоны и темы для FACEIT

Расширение для Chrome: свои фоны, темы интерфейса и звук найденного матча на **faceit.com**.

> Неофициально, не связано с FACEIT. Работает только на faceit.com и никуда не отправляет данные. Игру, клиент и античит не трогает.

#### Возможности

- **Библиотека** — твои фоны: ссылки (YouTube, Tenor, Giphy, .gif/.mp4/.png) и файлы до 60 МБ. Избранное, поиск, фильтры, переименование.
- **Мастерская** — готовые живые фоны (YouTube), новые подтягиваются из GitHub-репозитория `lobbyfx-workshop`.
- **Темы** — меняют кнопки, панели, цвета, шрифты.
- **Интерфейс** — свой цвет акцента, свой текст на кнопке поиска матча, скрытие миссий, Prestige Path, места в рейтинге, магазина и баннеров.
- **Матч** — свой звук найденного матча (3 встроенных, свой файл или ссылка, например с myinstants.com) и автоприём матча со случайной задержкой, только когда ты за ПК.
- **Фоны для страниц** — отдельно для каждой из 17 страниц FACEIT (лобби, матчрум, Track, история матчей, профиль…) или для всех сразу.
- **YouTube** — название и превью видео подтягиваются автоматически.
- **Ротация** — новый фон при каждом входе в лобби или каждые N секунд, с плавным переходом.
- **Резервная копия** — экспорт и импорт всего в один файл.
- **Языки** — українська, English, русский.

#### Установка

1. `chrome://extensions` → включи **Режим разработчика**.
2. **Загрузить распакованное расширение** → выбери эту папку.
3. Закрепи иконку LobbyFX на панели.

#### Мастерская

Каталог живёт в отдельном репозитории `lobbyfx-workshop` (шаблон прилагается).
В `lib/store.js` замени `YOUR_GITHUB` в `WORKSHOP_CATALOG` на свой ник.

#### Звук матча

FACEIT не сообщает, какой именно звук — «матч найден», поэтому расширение запоминает звуки, которые играет страница.
Найди матч один раз → открой вкладку **Матч** → нажми «Это звук матча» рядом с нужным.

#### Автоприём

Выключен по умолчанию. Ищет кнопку «Принять» в окне найденного матча и нажимает её со случайной задержкой. Может пропустить матч, если ты не трогал мышь и клавиатуру дольше заданного времени. Используешь на свой риск — проверь правила FACEIT.

#### Конфиденциальность

Всё хранится только в твоём браузере. Подробности — в [PRIVACY.md](PRIVACY.md) и на странице «Правила и конфиденциальность» в настройках расширения.

#### Лицензия

MIT. Звуки в `sounds/` сгенерированы для LobbyFX. Видео в Мастерской принадлежат их авторам на YouTube и показываются через официальный встроенный плеер YouTube. За фоны и звуки, которые добавляет пользователь, отвечает пользователь.
