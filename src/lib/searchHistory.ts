// 搜索历史管理优化工具
'use client';

// 搜索历史项接口
export interface SearchHistoryItem {
  keyword: string;
  timestamp: number;
  frequency: number; // 使用频率
  category?: 'recent' | 'frequent' | 'old'; // 分类
}

// 搜索历史统计
export interface SearchHistoryStats {
  totalCount: number;
  recentCount: number; // 最近7天
  frequentCount: number; // 高频搜索
  topKeywords: string[]; // 热门关键词
}

// 常量配置
export const SEARCH_HISTORY_CONFIG = {
  MAX_ITEMS: 30, // 增加最大保存条数
  RECENT_DAYS: 7, // 最近7天为"recent"
  FREQUENCY_THRESHOLD: 2, // 搜索2次以上算高频
  EXPIRE_DAYS: 90, // 90天后过期
  CACHE_DURATION: 5 * 60 * 1000, // 5分钟缓存
};

// 存储键
const SEARCH_HISTORY_ENHANCED_KEY = 'search_history_enhanced';
const SEARCH_HISTORY_STATS_KEY = 'search_history_stats';

// 缓存管理器
class SearchHistoryCache {
  private static instance: SearchHistoryCache;
  
  static getInstance(): SearchHistoryCache {
    if (!SearchHistoryCache.instance) {
      SearchHistoryCache.instance = new SearchHistoryCache();
    }
    return SearchHistoryCache.instance;
  }

  // 获取增强的搜索历史
  getEnhancedHistory(): SearchHistoryItem[] {
    try {
      const cached = localStorage.getItem(SEARCH_HISTORY_ENHANCED_KEY);
      if (!cached) return [];
      
      const history: SearchHistoryItem[] = JSON.parse(cached);
      return this.filterExpired(history);
    } catch (error) {
      console.warn('获取增强搜索历史失败:', error);
      return [];
    }
  }

  // 保存增强的搜索历史
  saveEnhancedHistory(history: SearchHistoryItem[]): void {
    try {
      // 限制数量和过滤过期
      const filtered = this.filterExpired(history)
        .sort((a, b) => b.timestamp - a.timestamp) // 按时间降序
        .slice(0, SEARCH_HISTORY_CONFIG.MAX_ITEMS);
      
      localStorage.setItem(SEARCH_HISTORY_ENHANCED_KEY, JSON.stringify(filtered));
      
      // 更新统计信息
      this.updateStats(filtered);
    } catch (error) {
      console.warn('保存增强搜索历史失败:', error);
    }
  }

  // 过滤过期的搜索历史
  private filterExpired(history: SearchHistoryItem[]): SearchHistoryItem[] {
    const now = Date.now();
    const expireTime = SEARCH_HISTORY_CONFIG.EXPIRE_DAYS * 24 * 60 * 60 * 1000;
    
    return history.filter(item => now - item.timestamp < expireTime);
  }

  // 更新统计信息
  updateStats(history: SearchHistoryItem[]): void {
    const now = Date.now();
    const recentTime = now - SEARCH_HISTORY_CONFIG.RECENT_DAYS * 24 * 60 * 60 * 1000;
    
    const stats: SearchHistoryStats = {
      totalCount: history.length,
      recentCount: history.filter(item => item.timestamp > recentTime).length,
      frequentCount: history.filter(item => item.frequency >= SEARCH_HISTORY_CONFIG.FREQUENCY_THRESHOLD).length,
      topKeywords: history
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, 10)
        .map(item => item.keyword)
    };
    
    try {
      localStorage.setItem(SEARCH_HISTORY_STATS_KEY, JSON.stringify(stats));
    } catch (error) {
      console.warn('保存搜索统计失败:', error);
    }
  }

  // 获取搜索历史统计
  getStats(): SearchHistoryStats | null {
    try {
      const cached = localStorage.getItem(SEARCH_HISTORY_STATS_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.warn('获取搜索统计失败:', error);
      return null;
    }
  }
}

// 主搜索历史管理器
export class SearchHistoryManager {
  private static instance: SearchHistoryManager;
  private cache: SearchHistoryCache;
  
  constructor() {
    this.cache = SearchHistoryCache.getInstance();
  }

  static getInstance(): SearchHistoryManager {
    if (!SearchHistoryManager.instance) {
      SearchHistoryManager.instance = new SearchHistoryManager();
    }
    return SearchHistoryManager.instance;
  }

  // 添加搜索关键词
  addKeyword(keyword: string): void {
    if (!keyword?.trim()) return;
    
    const trimmed = keyword.trim();
    const history = this.cache.getEnhancedHistory();
    
    // 查找是否已存在
    const existingIndex = history.findIndex(item => 
      item.keyword.toLowerCase() === trimmed.toLowerCase()
    );
    
    const now = Date.now();
    
    if (existingIndex >= 0) {
      // 更新已存在的项
      const existing = history[existingIndex];
      existing.timestamp = now;
      existing.frequency += 1;
      
      // 移动到前面
      history.splice(existingIndex, 1);
      history.unshift(existing);
    } else {
      // 添加新项
      history.unshift({
        keyword: trimmed,
        timestamp: now,
        frequency: 1
      });
    }
    
    this.cache.saveEnhancedHistory(history);
    this.notifyHistoryUpdated();
  }

  // 删除搜索关键词
  removeKeyword(keyword: string): void {
    const history = this.cache.getEnhancedHistory();
    const filtered = history.filter(item => 
      item.keyword.toLowerCase() !== keyword.toLowerCase()
    );
    
    this.cache.saveEnhancedHistory(filtered);
    this.notifyHistoryUpdated();
  }

  // 清空搜索历史
  clearHistory(): void {
    this.cache.saveEnhancedHistory([]);
    this.notifyHistoryUpdated();
  }

  // 添加搜索关键词
  addToHistory(keyword: string): void {
    this.addKeyword(keyword);
  }

  // 删除搜索关键词
  removeFromHistory(keyword: string): void {
    this.removeKeyword(keyword);
  }

  // 清空搜索历史
  clearAllHistory(): void {
    this.clearHistory();
  }

  // 获取最近的历史记录（兼容原有API）
  getRecentHistory(limit = 10): { query: string; timestamp: number }[] {
    const history = this.cache.getEnhancedHistory();
    return history.slice(0, limit).map(item => ({
      query: item.keyword,
      timestamp: item.timestamp
    }));
  }

  // 订阅搜索历史更新事件
  subscribeToUpdates(callback: (history: { query: string; timestamp: number }[]) => void): () => void {
    const handleHistoryUpdate = () => {
      const history = this.getRecentHistory(20); // 获取更多记录供筛选
      callback(history);
    };

    // 立即执行一次
    handleHistoryUpdate();

    // 添加事件监听器
    if (typeof window !== 'undefined') {
      window.addEventListener('searchHistoryEnhancedUpdated', handleHistoryUpdate);
      
      // 返回取消订阅函数
      return () => {
        window.removeEventListener('searchHistoryEnhancedUpdated', handleHistoryUpdate);
      };
    }

    // 如果不在浏览器环境，返回空函数
    return () => {
      // 空取消订阅函数
    };
  }
  getCategorizedHistory(): {
    recent: SearchHistoryItem[];
    frequent: SearchHistoryItem[];
    old: SearchHistoryItem[];
  } {
    const history = this.cache.getEnhancedHistory();
    const now = Date.now();
    const recentTime = now - SEARCH_HISTORY_CONFIG.RECENT_DAYS * 24 * 60 * 60 * 1000;
    
    const recent: SearchHistoryItem[] = [];
    const frequent: SearchHistoryItem[] = [];
    const old: SearchHistoryItem[] = [];
    
    history.forEach(item => {
      // 分类逻辑
      if (item.timestamp > recentTime) {
        recent.push(item);
      } else if (item.frequency >= SEARCH_HISTORY_CONFIG.FREQUENCY_THRESHOLD) {
        frequent.push(item);
      } else {
        old.push(item);
      }
    });
    
    return { recent, frequent, old };
  }

  // 获取搜索建议（包含历史和智能推荐）
  getSearchSuggestions(limit = 5): string[] {
    const history = this.cache.getEnhancedHistory();
    
    // 返回最近的搜索词和热门搜索词
    const suggestions = [
      ...history.slice(0, limit).map(item => item.keyword),
    ];
    
    // 去重并限制数量
    const uniqueSuggestions = Array.from(new Set(suggestions)).slice(0, limit);
    return uniqueSuggestions;
  }

  // 获取搜索统计
  getSearchStats(): SearchHistoryStats {
    const stats = this.cache.getStats();
    if (stats) return stats;
    
    // 如果没有缓存统计，重新计算
    const history = this.cache.getEnhancedHistory();
    this.cache.updateStats(history);
    return this.cache.getStats() || {
      totalCount: 0,
      recentCount: 0,
      frequentCount: 0,
      topKeywords: []
    };
  }

  // 搜索历史同步（与原有系统兼容）
  // 注意：这个方法暂时禁用，因为存在模块依赖问题
  // 增强型搜索历史系统已经包含了所有必要功能
  async syncWithLegacy(): Promise<string[]> {
    try {
      console.warn('搜索历史同步功能暂时禁用，增强型系统已内置所有功能');
      
      // 直接返回当前增强型系统的历史记录
      const enhancedHistory = this.cache.getEnhancedHistory();
      
      // 返回字符串数组格式（兼容原有API）
      const result = enhancedHistory.map(item => item.keyword);
      this.notifyHistoryUpdated();
      return result;
    } catch (error) {
      console.error('搜索历史同步失败:', error);
      return [];
    }
  }

  // 通知搜索历史更新
  private notifyHistoryUpdated(): void {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('searchHistoryEnhancedUpdated', {
          detail: this.getCategorizedHistory()
        })
      );
    }
  }
}

// 导出单例实例
export const searchHistoryManager = SearchHistoryManager.getInstance();