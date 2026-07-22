# 模块依赖关系图

> 基于社区检测与跨社区边生成的模块依赖关系。

共 **12** 个社区，**2524** 条跨社区边。

> 注：为保持可读性，隐藏了庞大的 `assets-constructor`（前端静态资源）社区。

```mermaid
graph LR
    C14[novelist-brain-dict<br/><small>1771 nodes · cohesion 0.27</small>]
    C23[tests-tick<br/><small>1038 nodes · cohesion 0.26</small>]
    C15[web-api<br/><small>73 nodes · cohesion 0.29</small>]
    C24[tools-draw<br/><small>73 nodes · cohesion 0.24</small>]
    C22[views-fmt<br/><small>64 nodes · cohesion 0.02</small>]
    C18[social-tone<br/><small>59 nodes · cohesion 0.07</small>]
    C19[composables-use<br/><small>27 nodes · cohesion 0.08</small>]
    C20[stores-fetch<br/><small>26 nodes · cohesion 0.31</small>]
    C13[lin-yi-context<br/><small>17 nodes · cohesion 0.05</small>]
    C21[utils-download<br/><small>6 nodes · cohesion 0.11</small>]
    C17[src-drawer<br/><small>5 nodes · cohesion 0.00</small>]
    C13 -->|173| C14
    C13 -->|2| C15
    C15 -->|8| C14
    C18 -->|1| C20
    C18 -->|6| C19
    C19 -->|4| C20
    C22 -->|6| C20
    C22 -->|10| C21
    C22 -->|1| C19
    C23 -->|2249| C14
    C23 -->|19| C24
    C23 -->|7| C13
    C23 -->|4| C15
    C24 -->|34| C14
```

## 社区列表

| 社区 | 大小 | 内聚度 | 主导语言 | 描述 |
|------|------|--------|----------|------|
| `assets-constructor` | 3579 | 0.532 | javascript | Directory-based community: src/novelist_brain/web/static |
| `novelist-brain-dict` | 1771 | 0.271 | python | Directory-based community: src/novelist_brain |
| `tests-tick` | 1038 | 0.261 | python | Directory-based community: tests |
| `web-api` | 73 | 0.289 | python | Directory-based community: src/novelist_brain/web |
| `tools-draw` | 73 | 0.241 | python | Directory-based community: tools |
| `views-fmt` | 64 | 0.019 | vue | Directory-based community: src/webui/src/views |
| `social-tone` | 59 | 0.074 | vue | Directory-based community: src/webui/src/components |
| `composables-use` | 27 | 0.084 | typescript | Directory-based community: src/webui/src/composables |
| `stores-fetch` | 26 | 0.315 | typescript | Directory-based community: src/webui/src/stores |
| `lin-yi-context` | 17 | 0.054 | python | Directory-based community: main |
| `utils-download` | 6 | 0.106 | typescript | Directory-based community: src/webui/src/utils |
| `src-drawer` | 5 | 0.000 | vue | Directory-based community: src/webui/src |

## 高耦合警告

- ⚠️ High coupling (2249 edges) between 'novelist-brain-dict' and 'tests-tick'
- ⚠️ High coupling (173 edges) between 'lin-yi-context' and 'novelist-brain-dict'
- ⚠️ High coupling (34 edges) between 'novelist-brain-dict' and 'tools-draw'
- ⚠️ High coupling (19 edges) between 'tests-tick' and 'tools-draw'
