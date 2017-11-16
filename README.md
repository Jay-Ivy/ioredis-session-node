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

## License

The original ioredis-session was distributed under the MIT License, and so is this. I've tried to
keep the original copyright and author credits in place, except in sections that I have rewritten
extensively.