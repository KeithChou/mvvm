class MVVM {
    constructor (option = {}) {
        this.$option = option
        const data = this._data = this.$option.data
        // 数据代理
        this.proxy(data)
        // 初始化computed
        this.initComputed()
        // 数据劫持
        observe(data, this)
        // DOM解析
        this.$compile = new Compile(option.el || document.body, this)
    }
}
