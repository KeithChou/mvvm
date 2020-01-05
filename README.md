## 简单理解Vue的响应式原理

Vue想必大家都很熟悉了，用的很多，但是不一定熟悉里面的原理。比如说虚拟DOM的实现、如何防护XSS攻击、响应式的原理等。Vue最强大的就是其响应式原理了。接下来，我们来看看Vue的响应式原理是如何实现的。看完之后，我们再来实现一个简易版本的MVVM，做到学以致用。

以下使用的Vue源码版本为2.6.10。

### 分析vue是如何实现数据响应式

在我们new一个Vue构造函数时，会触发`initState`的方法，这个方法里，针对data对象做了处理。
```
export function initState (vm: Component) {
  vm._watchers = []
  const opts = vm.$options
  // 初始化props对象
  if (opts.props) initProps(vm, opts.props)
  // 初始化methods对象
  if (opts.methods) initMethods(vm, opts.methods)
  // 判断data是否存在，如果存在
  if (opts.data) {
    initData(vm)
  } else {
    observe(vm._data = {}, true /* asRootData */)
  }
  // 初始化computed对象
  if (opts.computed) initComputed(vm, opts.computed)
  // 初始化watch对象
  if (opts.watch && opts.watch !== nativeWatch) {
    initWatch(vm, opts.watch)
  }
}
```

我们主要来看看`initData`函数做左咩野（做了什么）
```
function initData (vm: Component) {
  let data = vm.$options.data
  data = vm._data = typeof data === 'function'
    ? getData(data, vm)
    : data || {}
  ...
  // 去除大部分代码
  // observe data
  observe(data, true /* asRootData */)
}
```

这里通过实例对象取到了data，我们知道，在vue组件里，data是需要使用函数来定义的，所以在针对函数类型的data做了getData的处理。拿到data后，最后调用了observe方法。observe方法中，主要调用了Observer构造函数。这个构造函数在数据劫持、依赖收集方面起到了重要重要，来瞧瞧它做什么了。

```
export class Observer {
  constructor (value: any) {
    this.value = value
    this.dep = new Dep()
    this.vmCount = 0
    // 如果value是数组，则通过一些方法重写会导致数组变异的方法
    if (Array.isArray(value)) {
      if (hasProto) {
        protoAugment(value, arrayMethods)
      } else {
        copyAugment(value, arrayMethods, arrayKeys)
      }
      this.observeArray(value)
    } else {
      // 如果是对象，调用walk方法
      this.walk(value)
    }
  }

  /**
   * Walk through all properties and convert them into
   * getter/setters. This method should only be called when
   * value type is Object.
   */
  walk (obj: Object) {
    const keys = Object.keys(obj)
    // 循环遍历data中的每一个值
    for (let i = 0; i < keys.length; i++) {
      defineReactive(obj, keys[i])
    }
  }
}
```

constructor函数中主要针对数组和对象做了处理。如果是数组，那么去重写了会使原数组发生变化的方法（splice、push、pop、shift、unshift、sort、reverse），给这些方法都加上了getter和setter；针对对象，会循环对象里的每个key，然后通过defineReactive方法，对每个key、value值做数据劫持的处理。我们主要看看对象的处理，数组的大同小异hhh。

```
/**
 * Define a reactive property on an Object.
 */
export function defineReactive (
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {
  // new一个Dep构造函数
  const dep = new Dep()

  const property = Object.getOwnPropertyDescriptor(obj, key)
  if (property && property.configurable === false) {
    return
  }

  // cater for pre-defined getter/setters
  const getter = property && property.get
  const setter = property && property.set
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key]
  }

  let childOb = !shallow && observe(val)
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get: function reactiveGetter () {
      const value = getter ? getter.call(obj) : val
      // 当模板开始渲染时，Dep.target会被赋值
      // 此时数据被获取后，可以将模板push到自己的subs中。
      if (Dep.target) {
        dep.depend()
        if (childOb) {
          childOb.dep.depend()
          if (Array.isArray(value)) {
            dependArray(value)
          }
        }
      }
      return value
    },
    set: function reactiveSetter (newVal) {
      const value = getter ? getter.call(obj) : val
      /* eslint-disable no-self-compare */
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return
      }
      /* eslint-enable no-self-compare */
      if (process.env.NODE_ENV !== 'production' && customSetter) {
        customSetter()
      }
      // #7981: for accessor properties without setter
      if (getter && !setter) return
      if (setter) {
        setter.call(obj, newVal)
      } else {
        val = newVal
      }
      childOb = !shallow && observe(newVal)
      dep.notify()
    }
  })
}
```

主要做了以下几件事情

1. 对data对象中的每个key值都绑定了实例对象dep（每个key值都new了Dep构造函数）
2. 使用了Object.defineProperty方法，为每个key值绑定了getter和setter。
3. 当某个模板中依赖了数据，会触发getter方法，此时会将这个模板push到自己的dep对象中。表示说，有模板依赖我啦，要把它存起来，这样才知道是谁依赖我了，然后当我变化的时候可以通知它。这里也就是我们说的依赖收集。
4. 当数据发生变化时，会触发setter方法，此时会依次触发dep存下来的模板，完成相应的更新视图的操作。

简单说。Dep函数，在设计模式上，称为发布-订阅模式。订阅在于，当有模板依赖数据时，将对应的模板（Watcher）保存起来；发布在于，当数据发生改变时，通知对应的模板完成更新。

这里我们需要注意的是。某个key（数据）可以被多个视图依赖，所以在触发getter时，会使用数组保存下所有依赖的视图。

这时候需要放上vue官网的图压压惊。

![](data.png)

数据劫持、依赖收集我们已经简单的介绍过了，我们接下来看看数据是被模板依赖的。

Vue的一个厉害之处就是利用Virtual DOM模拟DOM对象树来优化DOM操作的一种技术或思路。Vue源码中虚拟DOM构建经历template编译成AST语法树 -> 再转换为render函数 最终返回一个VNode(VNode就是Vue的虚拟DOM节点)。

我们知道，操作DOM是一个成本很大的行为。在浏览器行为上来说，DOM树、CSS树和渲染树的构建是通过GUI渲染线程实现的，而JS的操作是通过JavaScript引擎线程实现的。

当我们用 JS 去操作 DOM 时，本质上是 JS 引擎和渲染引擎之间进行了“跨界交流”。这个“跨界交流”的实现并不简单，它依赖了桥接接口作为“桥梁”（如下图）。

![](./render.png)

过“桥”要收费——这个开销本身就是不可忽略的。我们每操作一次 DOM（不管是为了修改还是仅仅为了访问其值），都要过一次“桥”。过“桥”的次数一多，就会产生比较明显的性能问题。因此“减少 DOM 操作”的建议，并非空穴来风。

所以这也是为什么，Vue会存在虚拟DOM的概念。

为了方便理解，我们去除Virtual DOM的过程，稍微简单说下怎么实现这个过程

1. 获取模板的根节点，将el对象传入MVVM构造函数中
2. 将el对象通过DocumentFragment方法转换成文档碎片
3. 遍历el下的所有children对象
    - 获取{{}}的内容，通过textContent改变值
    - 获取v-on:click的内容, 给对应的节点加上addEventListener方法
    - 获取v-html的内容，通过innerHTML改变值
    - 获取v-model的内容，给表单元素加上input方法
    - 获取v-for的内容，对内容进行循环处理
4. 获取到数据后，直接改变当下数据的值。
5. 处理完之后，将文档碎片appendChild到el对象中。

这就是获取模板依赖了哪些数据的简单实现。

下篇文章学以致用，我们自己来实现一个简单的视图-数据响应式。