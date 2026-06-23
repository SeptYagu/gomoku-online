# 参考项目逻辑提取索引

更新日期：2026-06-23

这些文件记录从参考项目中学习到的模块逻辑。记录原则：

- MIT 项目可以迁移或改写代码，但必须保留许可证和署名。
- 无明确 LICENSE 的项目只提取产品流程、状态机、数据模型和交互思路，不复制源码。
- 所有最终实现都要重新用本项目的 TypeScript、i18n、主题、测试和服务端权威状态体系落地。

模块文件：

- `realtime-room-module.md`：好友房、Socket.IO 房间、断线处理。
- `lobby-matchmaking-module.md`：大厅、房间列表、随机找局、私密房。
- `rating-leaderboard-module.md`：评分、排行榜、离开惩罚、榜单刷新。
- `rules-engine-module.md`：棋盘、落子校验、胜负检测、测试边界。
- `ai-engine-module.md`：候选点、棋型评分、minimax、alpha-beta。
- `ai-worker-persistence-module.md`：AI Worker、悔棋取消、设置持久化。
- `i18n-theme-module.md`：翻译字典、默认英语、黑暗模式、RTL。

主要参考源：

- https://github.com/scheng20/gomoku-online
- https://github.com/minh100/Gomoku
- https://github.com/sen-ltd/gomoku-ai
- https://github.com/yyjhao/HTML5-Gomoku
- https://socket.io/docs/v4/rooms/
