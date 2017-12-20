# ioredis-session-node

## installation

```bash
npm install ioredis-session
```

## usage

Minimalist version:
```javascript
global.Redis = require('ioredis-session');
app.use(Redis({
    sessionKey: "sid",           // session名称
    sidPrefix: "sid-prefix-",    // session sid value 前缀
    expires: 30 * 60 * 1000,     // 过期时间（毫秒）
    redisNodes: [{               // redis集群节点配置
         "port": "7000",
         "host": "192.168.2.210"
     }, {
         "port": "7001",
         "host": "192.168.2.210"
     }]
}));
```
set redis session:
Redis.save(req, res).then(() => next()).catch((err) => next(err));
```

```
reset redis session:
Redis.reset(req, res).then(() => next()).catch((err) => next(err));
```

```
redis cluster instance:
Redis.Cluster.set("key", "value").then(() => next()).catch((err) => next(err));
```

```
1、添加依赖：
"ioredis-session": "~0.0.6"

2、引入Redis Session对象：
global.Redis = require('ioredis-session');
 
3、添加session中间件
let redisConfig = {
    sessionKey: 'sid',  // session属性key名称，默认sid
    sidPrefix: '',  // session sid value 统一前缀，默认空
    refreshSession: true,  // 是否刷新session过期时间，默认true
    expires: 30 * 60 * 1000,  // session过期时间，单位：毫秒，默认30分钟
    redisNodes: [{
        host: '127.0.0.1',
        port: '8080',
    }, {
        host: '127.0.0.1',
        port: '8081',
    }],  // redis集群节点配置
};
app.use(Redis(redisConfig));
 
4、设置session，req.session对象
req.session.userName = "Jay";
 
5、保存session
直接调用方法（返回Promise对象）：
Redis.save(req, res).then(function() {
    next();
}).catch(function(err) {
    next(err);
});
 
作为中间件使用：
app.use(Redis.save)
 
6、清除session
直接调用方法：
Redis.reset(req, res, next);
 
作为中间件调用：
app.use(Redis.reset);
```

## License

The original ioredis-session was distributed under the MIT License, and so is this. I've tried to
keep the original copyright and author credits in place, except in sections that I have rewritten
extensively.