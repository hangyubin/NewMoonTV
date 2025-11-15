/**
 * 热门搜索管理模块
 * 负责统计和管理用户搜索趋势，提供热门关键词功能
 */

export interface TrendingSearchItem {
  keyword: string;
  count: number;
  lastSearched: number;
  category?: string; // 搜索类别（电影、电视剧、动漫等）
}

export interface TrendingSearchConfig {
  MAX_ITEMS: number; // 最大存储条目数
  CATEGORY_TYPES: string[]; // 搜索类别
  TIME_WINDOW: number; // 统计时间窗口（毫秒）
}

// 热门搜索配置
const TRENDING_CONFIG: TrendingSearchConfig = {
  MAX_ITEMS: 50, // 最多保存50个热门搜索词
  CATEGORY_TYPES: ['电影', '电视剧', '动漫', '综艺', '纪录片', '其他'],
  TIME_WINDOW: 7 * 24 * 60 * 60 * 1000, // 7天时间窗口
};

// 缓存键名
const TRENDING_SEARCH_KEY = 'trending_search_cache';
const TRENDING_SEARCH_PREFIX = 'trending:category:';

/**
 * 热门搜索统计管理类
 */
export class TrendingSearchManager {
  private static readonly INSTANCE: TrendingSearchManager = new TrendingSearchManager();
  private trendingData: Map<string, TrendingSearchItem[]> = new Map();
  private lastUpdate = 0;
  private readonly UPDATE_INTERVAL = 60 * 1000; // 1分钟更新间隔

  private constructor() {
    this.initializeFromCache();
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): TrendingSearchManager {
    return TrendingSearchManager.INSTANCE;
  }

  /**
   * 初始化时从localStorage加载缓存
   */
  private initializeFromCache(): void {
    try {
      if (typeof window !== 'undefined') {
        const cached = localStorage.getItem(TRENDING_SEARCH_KEY);
        if (cached) {
          const data = JSON.parse(cached);
          this.trendingData = new Map(Object.entries(data.cache || {}));
          this.lastUpdate = data.lastUpdate || 0;
        }
      }
    } catch (error) {
      console.warn('加载热门搜索缓存失败:', error);
    }
  }

  /**
   * 从localStorage加载缓存
   */
  private loadFromCache(): void {
    this.initializeFromCache();
  }

  /**
   * 保存到localStorage
   */
  private saveToCache(): void {
    try {
      if (typeof window !== 'undefined') {
        const data = {
          cache: Object.fromEntries(this.trendingData),
          lastUpdate: this.lastUpdate,
        };
        localStorage.setItem(TRENDING_SEARCH_KEY, JSON.stringify(data));
      }
    } catch (error) {
      console.warn('保存热门搜索缓存失败:', error);
    }
  }

  /**
   * 记录搜索关键词
   * @param keyword 搜索关键词
   * @param category 搜索类别
   */
  public async recordSearch(keyword: string, category = '其他'): Promise<void> {
    if (!keyword || keyword.trim().length === 0) return;

    const normalizedKeyword = keyword.trim().toLowerCase();
    const categoryKey = TRENDING_SEARCH_PREFIX + category;

    try {
      // 更新缓存
      if (!this.trendingData.has(categoryKey)) {
        this.trendingData.set(categoryKey, []);
      }

      const categoryData = this.trendingData.get(categoryKey);
      if (!categoryData) return;
      
      const existingItem = categoryData.find(item => item.keyword === normalizedKeyword);

      const now = Date.now();

      if (existingItem) {
        // 更新已存在的记录
        existingItem.count += 1;
        existingItem.lastSearched = now;
      } else {
        // 添加新记录
        categoryData.push({
          keyword: normalizedKeyword,
          count: 1,
          lastSearched: now,
          category,
        });
      }

      // 清理过期数据并限制数量
      this.cleanupCategoryData(categoryData, category);
      this.lastUpdate = now;
      this.saveToCache();

      // 异步发送到服务器
      this.syncToServer(keyword, category);
    } catch (error) {
      console.warn('记录热门搜索失败:', error);
    }
  }

  /**
   * 清理类别数据，移除过期和限制数量
   */
  private cleanupCategoryData(data: TrendingSearchItem[], category: string): void {
    const now = Date.now();
    const cutoffTime = now - TRENDING_CONFIG.TIME_WINDOW;

    // 移除过期数据
    const filtered = data.filter(item => item.lastSearched > cutoffTime);

    // 按搜索次数排序，保留前MAX_ITEMS个
    filtered.sort((a, b) => {
      // 主要按搜索次数排序
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      // 搜索次数相同时，按最后搜索时间排序
      return b.lastSearched - a.lastSearched;
    });

    // 限制数量
    const limited = filtered.slice(0, TRENDING_CONFIG.MAX_ITEMS);
    const categoryKey = TRENDING_SEARCH_PREFIX + category;
    this.trendingData.set(categoryKey, limited);
  }

  /**
   * 同步到服务器
   */
  private async syncToServer(keyword: string, category: string): Promise<void> {
    try {
      await fetch('/api/trending-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          keyword,
          category,
          timestamp: Date.now(),
        }),
      });
    } catch (error) {
      // 静默失败，不影响用户体验
      console.debug('同步热门搜索到服务器失败:', error);
    }
  }

  /**
   * 获取热门搜索列表
   * @param category 类别，如果为空则返回所有类别的热门搜索
   * @param limit 返回数量限制
   * @returns 热门搜索列表
   */
  public getTrendingSearches(category?: string, limit = 10): TrendingSearchItem[] {
    try {
      if (category) {
        // 返回指定类别的热门搜索
        const categoryKey = TRENDING_SEARCH_PREFIX + category;
        const data = this.trendingData.get(categoryKey) || [];
        return data.slice(0, limit);
      } else {
        // 返回所有类别的热门搜索合并排序
        const allData: TrendingSearchItem[] = [];
        
        this.trendingData.forEach((categoryData) => {
          allData.push(...categoryData);
        });

        // 去重并合并相同关键词的数据
        const merged = this.mergeDuplicateKeywords(allData);

        // 排序
        merged.sort((a, b) => {
          if (b.count !== a.count) {
            return b.count - a.count;
          }
          return b.lastSearched - a.lastSearched;
        });

        return merged.slice(0, limit);
      }
    } catch (error) {
      console.warn('获取热门搜索失败:', error);
      return [];
    }
  }

  /**
   * 合并相同关键词的数据
   */
  private mergeDuplicateKeywords(data: TrendingSearchItem[]): TrendingSearchItem[] {
    const mergedMap = new Map<string, TrendingSearchItem>();

    data.forEach(item => {
      const existing = mergedMap.get(item.keyword);
      if (existing) {
        existing.count += item.count;
        if (item.lastSearched > existing.lastSearched) {
          existing.lastSearched = item.lastSearched;
        }
      } else {
        mergedMap.set(item.keyword, { ...item });
      }
    });

    return Array.from(mergedMap.values());
  }

  /**
   * 清理过期数据
   */
  public cleanupExpiredData(): void {
    try {
      const now = Date.now();
      const _cutoffTime = now - TRENDING_CONFIG.TIME_WINDOW;

      this.trendingData.forEach((data, category) => {
        this.cleanupCategoryData(data, category.replace(TRENDING_SEARCH_PREFIX, ''));
      });

      this.lastUpdate = now;
      this.saveToCache();
    } catch (error) {
      console.warn('清理热门搜索过期数据失败:', error);
    }
  }

  /**
   * 获取所有支持的类别
   */
  public getSupportedCategories(): string[] {
    return TRENDING_CONFIG.CATEGORY_TYPES;
  }

  /**
   * 清除所有数据
   */
  public clearAll(): void {
    this.trendingData.clear();
    this.lastUpdate = 0;
    this.saveToCache();
  }

  /**
   * 导出数据（用于备份）
   */
  public exportData(): object {
    return {
      cache: Object.fromEntries(this.trendingData),
      lastUpdate: this.lastUpdate,
      config: TRENDING_CONFIG,
    };
  }

  /**
   * 导入数据（用于恢复）
   */
  public importData(data: { cache: object; lastUpdate?: number }): void {
    try {
      if (data.cache && typeof data.cache === 'object') {
        this.trendingData = new Map(Object.entries(data.cache));
      }
      this.lastUpdate = data.lastUpdate || 0;
      this.saveToCache();
    } catch (error) {
      console.warn('导入热门搜索数据失败:', error);
    }
  }
}

// 导出单例实例
export const trendingSearchManager = TrendingSearchManager.getInstance();