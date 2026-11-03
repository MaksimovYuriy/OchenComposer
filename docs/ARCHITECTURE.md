# Организация проекта

Исходники разделены по ответственности. manifest.json по-прежнему загружает
code.js и ui.html из корня. Эти два файла создаёт сборка; редактировать нужно src/.
Идентификаторы, содержимое SVG, формат pluginData и пользовательские сценарии
при реорганизации не менялись.

```text
src/
  composition/  types.ts, geometry.ts, names.ts, layout.ts
  scene/        contract.ts, relations.ts, layout.ts
  library/      subjects.ts
  ai/           prompt.ts, settings.ts, openrouter.ts, response.ts, planner.ts
  palette/      model.ts, registry.ts, figma.ts
  plugin/       main.ts, editor.ts, svg-export.ts
  ui/           index.html, styles.css, main.js
assets/         исходные SVG; структура и пути сохранены
catalog/        палитры, правила ИИ, политика углов, примеры JSON
docs/           ТЗ, требования, итерации, устройство алгоритмов
scripts/        сборка, граф исходников, превью, проверка SVG в браузере
tests/          проверки чистых функций, адаптеров и интерфейса
generated/      упакованная библиотека; генерируется
out/            локальные отчёты, рендеры, временные проверки
```

## Границы ответственности

| Где | Что менять |
| --- | --- |
| [composition/types.ts](../src/composition/types.ts) | Общие типы ассетов, матриц, размещений и качества |
| [composition/geometry.ts](../src/composition/geometry.ts) | Размеры повёрнутого предмета, матрицы, проверка общего масштаба |
| [composition/names.ts](../src/composition/names.ts) | Разбор прямых названий и синонимов |
| [composition/layout.ts](../src/composition/layout.ts) | Шаблоны, кандидаты и оценка композиций по названиям |
| [scene/contract.ts](../src/scene/contract.ts) | Формат плана, экземпляры, реестр типов связей и валидация |
| [scene/relations.ts](../src/scene/relations.ts) | Геометрическая проверка пространственных правил |
| [scene/layout.ts](../src/scene/layout.ts) | Выполнение плана ИИ, опоры, выравнивание, общий масштаб и плотность |
| [library/subjects.ts](../src/library/subjects.ts) | Текстовые названия и смысловые ассоциации компонентов, без SVG |
| [ai/prompt.ts](../src/ai/prompt.ts) | Версия контракта, параметры запроса, сборка промпта |
| [ai/settings.ts](../src/ai/settings.ts) | Личный ключ, модель, сессия и clientStorage |
| [ai/openrouter.ts](../src/ai/openrouter.ts) | HTTPS-запрос, авторизация, таймаут и HTTP-ошибки |
| [ai/response.ts](../src/ai/response.ts) | Разбор и безопасная нормализация ответа модели |
| [ai/planner.ts](../src/ai/planner.ts) | Интерпретация и одна попытка исправления по замечанию проверки |
| [palette/model.ts](../src/palette/model.ts) | Чистая валидация схем и преобразование цветов |
| [palette/registry.ts](../src/palette/registry.ts) | Встроенные и личные палитры, хранение и сообщения панели |
| [palette/figma.ts](../src/palette/figma.ts) | Применение цветов к дереву Figma с откатом |
| [plugin/main.ts](../src/plugin/main.ts) | Точка запуска, события и маршрутизация команд |
| [plugin/editor.ts](../src/plugin/editor.ts) | Правка текущих нативных объектов и снимок сцены |
| [plugin/svg-export.ts](../src/plugin/svg-export.ts) | Проверка и экспорт временного снимка композиции |
| [ui/index.html](../src/ui/index.html) | Разметка панели |
| [ui/styles.css](../src/ui/styles.css) | Стили панели |
| [ui/main.js](../src/ui/main.js) | Состояние интерфейса, кнопки, сообщения, клиентская проверка SVG |

composition/, scene/, library/ и palette/model.ts не обращаются к Figma, DOM и сети.
Это проверяется отдельным тестом границ. Создание/удаление объектов документа
выполняют адаптеры plugin/ и palette/figma.ts. Ключ не участвует в модели сцены.

## Сборка и зависимости

TypeScript остаётся набором script-файлов в одном runtime Figma, собираемым tsc
через outFile. Это разделение ответственности по файлам, а не переход на изолированные
ES-модули. Общие типы, функции и некоторые состояния доступны между файлами.
Отдельный загрузчик модулей или новые зависимости не добавлялись.

Порядок определяется tsconfig.json. scripts/sources.mjs описывает те же логические
группы для VM-тестов и превью. Тест архитектуры проверяет совпадение списков,
отсутствие дублей и включение всех TypeScript-файлов src/. При добавлении файла
нужно обновить оба списка; забытый источник приводит к падению теста.

`npm run build`:
1. Проверяет SVG и конфигурацию из assets/ и catalog/.
2. Создаёт generated/assets.ts с библиотекой, палитрами и правилами ИИ.
3. Собирает TypeScript в code.js.
4. Вставляет styles.css и main.js в шаблон index.html, создавая единый ui.html.

В панели нет внешних CSS/JS-файлов во время выполнения. Строки интерфейса вставляются
функцией замены, поэтому символы вроде `$` внутри скрипта не интерпретируются сборкой.

`npm test` сначала выполняет сборку, затем запускает проверки. `npm run lint`
теперь проверяет также JavaScript панели, прежде находившийся внутри HTML.
`npm run watch` отслеживает src/, assets/, catalog/ и scripts/. После пересборки
нужно перезапустить плагин в Figma.

## Исходники и артефакты

- Правила ИИ редактируются в catalog/ai-composition-rules.json; файл попадёт в сборку.
- SVG в assets/ при реорганизации не преобразовывались и не переименовывались.
- generated/, code.js, ui.html — результаты сборки. out/ — временные материалы.
- В docs/ лежат требования и история; старые имена файлов в записях описывают
  прежние версии. Актуальные пути приведены в этом документе.
- Для запуска готового плагина нужны manifest.json, code.js и ui.html. Для проверки
  исходников дополнительно передаётся проект без node_modules/ и временного out/.

Все прежние проверки поведения сохранены. При переносе дополнительно сравнены
состав JavaScript-операторов сборки до/после (без комментариев) и точное содержимое
генерируемого ui.html. Новая схема сборки создаёт ту же панель.
