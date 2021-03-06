# Имплементация компонентов

Гибкость наследования порой оборачивается рядом неудобств. Допустим, элемент `TaxiForm__select` наследуется от контрола `Select`, у которого есть свои элементы `Select__option`, `Select__icon`и `Select__button`. В итоге, придется каждый элемент унаследовать дополнительно. Кроме того, если блок `select` обновит свою структуру, это придется учесть во всех потомках. От таких неудобств избавляет механизм имплементации.

__Имплементация__ — замена элемента блоком с добавлением поведения элемента.

```xml
<TaxiForm>
    ...
    <select>
        <option>Эконом</option>
        <option>Комфорт</option>
        <option>Бизнес</option>
    </select>
</TaxiForm>
```

```js
Beast.decl({
    TaxiForm__select: {
        expand: function () {
            this.implementWith(<Select>{this.get('option')}</Select>)
        }
    }
})
```

Результирующий HTML:

```xml
<div class="taxiform">
    ...
    <select class="taxiform__select select">
        <option class="select__option">Эконом</option>
        <option class="select__option">Комфорт</option>
        <option class="select__option">Бизнес</option>
    </select>
</div>
```

Важно отметить, что элементы блока `select` не получили дополнительных CSS-классов — класс `taxiForm__select` получил только сам блок, став компонентом-гибридом. Гибридность позволяет в контексте `taxiForm` обращаться с `select` как к элементом, при этом компонент будет оставаться полноценным блоком.

Но это не всё. Скорее всего, `taxiForm` потребовалось бы назвачить обработчики событий на встраиваемый блок. Это можно сделать из родительского блока:

```js
Beast.decl({
    TaxiForm: {
        domInit: function () {
            this.elem('select')[0].on('Change', function () {...})
        }
    }
})
```

Но в этот момент нарушается наглядный декларативный подход к описанию поведения компонентов. Поэтому метод `implementWith` помимо того, что вставляет на место элемента блок, еще и применяет к блоку поля из декларации того самого элемента, за исключением `expand` по понятным причинам. Это позволяет писать так:

```js
Beast.decl({
    TaxiForm__select: {
        expand: function () {
            this.implementWith(<Select>{this.get('option')}</Select>)
        }
        on: {
            Change: function () {...}
        }
    }
})
```

Теперь компонент-гибрид `Select` является полноценным элементом со своей декларацией.

__Отюда простое правило:__ если дочерний блок всем устраивает и в нем не требуется делать никаких дополнительных изменений, его лучше имплементировать, чем наследовать.
