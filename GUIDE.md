# SSH 管理面板 - 进阶使用指南

---

## 📦 目录结构说明
ssh-manager/
├── start.sh ← 一键启动（日常用这个）
├── README.md ← 快速上手指南
├── GUIDE.md ← 本文件（进阶使用）
├── node/ ← 自带 Node.js 运行时（不用管）
├── vendor/xterm/ ←界面渲染层 (自带)
├── public/ ← 前端页面（可修改）
├── server/ ← 后端服务（可修改）
├── server.js ← 服务入口
├── package.json ← 依赖清单
├── cert/ ← HTTPS 证书目录
└── logs/ ← 审计日志目录





---

## 🚀 日常使用

```bash
# 启动服务
cd ssh-manager
./start.sh

# 看到输出后，打开浏览器访问提示地址
# 例如：http://192.168.1.100:3000

# 停止服务
# 按 Ctrl + C



🔐 生成 HTTPS 证书（生产环境推荐）
# 1. 进入证书目录
cd ssh-manager
mkdir -p cert && cd cert

# 2. 安装本地证书颁发机构
npx mkcert -install

# 3. 生成证书（替换 192.168.1.x 为你的实际局域网 IP）
npx mkcert localhost 127.0.0.1 192.168.1.x

# 4. 重命名为固定名称
mv localhost+*-key.pem key.pem
mv localhost+*.pem cert.pem

# 5. 返回项目根目录
cd ..

重启服务，控制台会显示 🔒 HTTPS 已启用。
注意： mkcert 生成的证书仅用于开发/内网环境。公网部署请使用 Let's Encrypt 等正规证书。



🔑 设置管理员密码
# 方式一：临时设置（每次启动都要设）
export ADMIN_PASSWORD='你的安全密码'
./start.sh

# 方式二：写入配置文件（推荐）
# 编辑 server/config.js，添加：
# ADMIN_PASSWORD: '你的安全密码'



📋 查看审计日志
# 实时查看最新日志
npm run logs

# 查看所有日志文件
ls logs/

# 查看特定日期的日志
cat logs/audit-2024-01-01.log
```bash


##❓ 常见问题
Q：启动时提示端口被占用？
服务会自动递增端口，无需手动处理。也可以手动指定端口：
PORT=8080 ./start.sh

Q：如何修改端口？
编辑 server/config.js 中的 PORT 值，或启动时指定：
PORT=8080 ./start.sh

Q：文件管理无法删除某些文件？
系统对 /etc、/sys、/proc 等系统目录有写保护，防止误操作。可在 server/config.js 的 PROTECTED_PATHS 中调整。



## 📝 许可

本项目基于AGPL-3许可开源，我知道这很严格，但确实没办法，你用无所谓，但我不希望你改完之后还藏着掖着，有问题请提交给我。


---
