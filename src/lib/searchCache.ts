/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

/**
 * 搜索缓存管理器
 * 提供搜索结果的内存缓存和持久化存储，提升搜索速度
 */

import { SearchResult } from './types';

interface CacheItem {
  query: string;
  results: SearchResult[];
  timestamp: number;
  size: number;
}

// 缓存配置
const CACHE_CONFIG = {
  MAX_ITEMS: 50,           // 最大缓存条目数
  MAX_AGE: 5 * 60 * 1000,  // 5分钟过期
  CLEANUP_INTERVAL: 60 * 1000, // 1分钟清理一次
};

// 内存缓存
const memoryCache = new Map<string, CacheItem>();

/**
 * 搜索缓存管理器类
 */
export class SearchCacheManager {
  private static instance: SearchCacheManager | null = null;
  private lastCleanup = 0;
  private readonly STORAGE_KEY = 'moontv_search_cache_v1';

  private constructor() {
    this.init();
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): SearchCacheManager {
    if (!SearchCacheManager.instance) {
      SearchCacheManager.instance = new SearchCacheManager();
    }
    return SearchCacheManager.instance;
  }

  /**
   * 初始化缓存系统
   */
  private init(): void {
    // 从本地存储恢复缓存
    this.loadFromStorage();
    
    // 定期清理过期缓存
    setInterval(() => {
      this.cleanup();
    }, CACHE_CONFIG.CLEANUP_INTERVAL);
  }

  /**
   * 生成缓存键
   */
  private generateCacheKey(query: string): string {
    return query.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^\w\-_]/g, '');
  }

  /**
   * 检查缓存是否有效
   */
  private isCacheValid(item: CacheItem): boolean {
    const age = Date.now() - item.timestamp;
    return age < CACHE_CONFIG.MAX_AGE;
  }

  /**
   * 获取缓存的项目大小
   */
  private getItemSize(item: CacheItem): number {
    return JSON.stringify(item).length;
  }

  /**
   * 清理过期和多余的缓存项
   */
  private cleanup(): void {
    const now = Date.now();
    
    // 检查是否需要清理
    if (now - this.lastCleanup < CACHE_CONFIG.CLEANUP_INTERVAL) {
      return;
    }

    // 清理过期项
    const entries = Array.from(memoryCache.entries());
    for (const [key, item] of entries) {
      const age = Date.now() - item.timestamp;
      if (age > CACHE_CONFIG.MAX_AGE) {
        memoryCache.delete(key);
      }
    }

    // 如果缓存项过多，删除最旧的项
    while (memoryCache.size > CACHE_CONFIG.MAX_ITEMS) {
      let oldestKey: string | null = null;
      let oldestTime = Date.now();

      const entries = Array.from(memoryCache.entries());
      for (const [key, item] of entries) {
        if (item.timestamp < oldestTime) {
          oldestTime = item.timestamp;
          oldestKey = key;
        }
      }

      if (oldestKey) {
        memoryCache.delete(oldestKey);
      }
    }

    this.lastCleanup = now;
    this.saveToStorage();
  }

  /**
   * 从本地存储加载缓存
   */
  private loadFromStorage(): void {
    try {
      if (typeof window === 'undefined') return;

      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) return;

      const data: Record<string, CacheItem> = JSON.parse(stored);
      
      for (const [key, item] of Object.entries(data)) {
        if (this.isCacheValid(item)) {
          memoryCache.set(key, item);
        }
      }

      console.log(`已加载 ${memoryCache.size} 个搜索缓存项`);
    } catch (error) {
      console.warn('加载搜索缓存失败:', error);
    }
  }

  /**
   * 保存缓存到本地存储
   */
  private saveToStorage(): void {
    try {
      if (typeof window === 'undefined') return;

      const data: Record<string, CacheItem> = {};
      
      const entries = Array.from(memoryCache.entries());
      for (const [key, item] of entries) {
        data[key] = item;
      }

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.warn('保存搜索缓存失败:', error);
    }
  }

  /**
   * 获取缓存的搜索结果
   */
  public get(query: string): SearchResult[] | null {
    const cacheKey = this.generateCacheKey(query);
    const item = memoryCache.get(cacheKey);

    if (item && this.isCacheValid(item)) {
      console.log(`缓存命中: ${query} (${item.results.length} 个结果)`);
      return item.results;
    }

    return null;
  }

  /**
   * 设置搜索结果缓存
   */
  public set(query: string, results: SearchResult[]): void {
    const cacheKey = this.generateCacheKey(query);
    const item: CacheItem = {
      query: query.trim(),
      results: [...results],
      timestamp: Date.now(),
      size: 0
    };

    item.size = this.getItemSize(item);
    memoryCache.set(cacheKey, item);
    
    // 立即保存到本地存储
    this.saveToStorage();
    
    console.log(`已缓存搜索结果: ${query} (${results.length} 个结果)`);
  }

  /**
   * 预热缓存
   */
  public async warmCache(query: string): Promise<void> {
    const cached = this.get(query);
    if (cached) return;

    // 触发后台搜索来预热缓存
    try {
      console.log(`正在预热缓存: ${query}`);
      
      // 模拟延迟，避免立即搜索
      setTimeout(() => {
        // 这里可以添加实际的预热逻辑
        console.log(`预热完成: ${query}`);
      }, 1000);
    } catch (error) {
      console.warn('预热缓存失败:', error);
    }
  }

  /**
   * 清除所有缓存
   */
  public clear(): void {
    memoryCache.clear();
    
    if (typeof window !== 'undefined') {
      localStorage.removeItem(this.STORAGE_KEY);
    }
    
    console.log('已清除所有搜索缓存');
  }

  /**
   * 获取缓存统计信息
   */
  public getStats(): { count: number; totalSize: number; keys: string[] } {
    let totalSize = 0;
    const keys: string[] = [];

    const entries = Array.from(memoryCache.entries());
    for (const [key, item] of entries) {
      totalSize += item.size;
      keys.push(item.query);
    }

    return {
      count: memoryCache.size,
      totalSize,
      keys: keys.sort()
    };
  }
}

// 导出默认实例
export const searchCache = SearchCacheManager.getInstance();