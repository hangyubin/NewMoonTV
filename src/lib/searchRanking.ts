/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

import { SearchResult } from './types';

// 排序权重配置
export interface RankingConfig {
  titleWeight: number;        // 标题匹配权重
  yearWeight: number;         // 年份匹配权重  
  sourceWeight: number;       // 来源质量权重
  popularityWeight: number;   // 流行度权重
  recencyWeight: number;      // 新鲜度权重
  diversityWeight: number;    // 多样性权重
}

// 来源质量评分
const SOURCE_QUALITY_SCORES: Record<string, number> = {
  'douban': 95,      // 豆瓣最高质量
  'imdb': 90,        // IMDB高质量
  'tmdb': 85,        // TMDB高质量
  'mgtv': 80,        // 芒果TV中等质量
  'iqiyi': 75,       // 爱奇艺中等质量
  'tencent': 75,     // 腾讯视频中等质量
  'youku': 70,       // 优酷中等质量
  'bilibili': 70,    // B站中等质量
  'pptv': 60,        // PPTV较低质量
  'sohu': 60,        // 搜狐较低质量
  'default': 50      // 默认质量
};

// 搜索结果排序器
export class SearchResultRanker {
  private config: RankingConfig;
  private searchHistoryManager: any;

  constructor(config?: Partial<RankingConfig>) {
    this.config = {
      titleWeight: 0.35,        // 标题匹配最重要
      yearWeight: 0.15,         // 年份匹配
      sourceWeight: 0.20,       // 来源质量
      popularityWeight: 0.15,   // 流行度
      recencyWeight: 0.10,      // 新鲜度
      diversityWeight: 0.05,    // 多样性
      ...config
    };
    
    // 延迟初始化搜索历史管理器，避免服务端渲染错误
    this.initSearchHistoryManager();
  }

  /**
   * 延迟初始化搜索历史管理器
   */
  private initSearchHistoryManager(): void {
    try {
      // 检查是否在浏览器环境
      if (typeof window !== 'undefined') {
        // 延迟初始化，避免服务端渲染错误
        setTimeout(() => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const searchHistoryModule = require('./searchHistory');
            const SearchHistoryManager = searchHistoryModule.SearchHistoryManager;
            if (SearchHistoryManager) {
              this.searchHistoryManager = SearchHistoryManager.getInstance();
            }
          } catch (error) {
            console.warn('初始化搜索历史管理器失败:', error);
          }
        }, 0);
      }
    } catch (error) {
      console.warn('搜索历史管理器初始化失败:', error);
    }
  }

  /**
   * 主排序方法
   */
  async rankResults(results: SearchResult[], query: string): Promise<SearchResult[]> {
    if (!results || results.length === 0) {
      return results;
    }

    // 第一步：计算基础评分
    const scoredResults = await Promise.all(
      results.map(async (result) => ({
        result,
        scores: await this.calculateScores(result, query)
      }))
    );

    // 第二步：去重处理
    const deduplicatedResults = this.deduplicateResults(scoredResults);

    // 第三步：计算综合评分
    const finalScoredResults = deduplicatedResults.map(item => ({
      ...item,
      finalScore: this.calculateFinalScore(item.scores)
    }));

    // 第四步：多样性优化
    const diversifiedResults = this.optimizeDiversity(finalScoredResults);

    // 第五步：按最终评分排序
    return diversifiedResults
      .sort((a, b) => b.finalScore - a.finalScore)
      .map(item => item.result);
  }

  /**
   * 计算各项评分
   */
  private async calculateScores(result: SearchResult, query: string) {
    const titleScore = this.calculateTitleScore(result.title, query);
    const yearScore = this.calculateYearScore(result.year, query);
    const sourceScore = this.calculateSourceScore(result.source);
    const popularityScore = await this.calculatePopularityScore(result);
    const recencyScore = this.calculateRecencyScore(result);
    
    return {
      titleScore,
      yearScore,
      sourceScore,
      popularityScore,
      recencyScore
    };
  }

  /**
   * 计算标题匹配评分
   */
  private calculateTitleScore(title: string, query: string): number {
    if (!title || !query) return 0;

    const normalizedTitle = title.toLowerCase().trim();
    const normalizedQuery = query.toLowerCase().trim();
    
    // 完全匹配
    if (normalizedTitle === normalizedQuery) return 100;
    
    // 标题包含查询词
    if (normalizedTitle.includes(normalizedQuery)) {
      const ratio = normalizedQuery.length / normalizedTitle.length;
      // 查询词在标题中越靠前、占比越高，分数越高
      const position = normalizedTitle.indexOf(normalizedQuery);
      const positionBonus = Math.max(0, 1 - position / normalizedTitle.length);
      return 80 + Math.floor(ratio * 15) + Math.floor(positionBonus * 5);
    }
    
    // 模糊匹配 - 计算编辑距离
    const similarity = this.calculateStringSimilarity(normalizedTitle, normalizedQuery);
    return Math.floor(similarity * 60);
  }

  /**
   * 计算年份匹配评分
   */
  private calculateYearScore(year: string, query: string): number {
    if (!year || !query) return 50; // 中性分数
    
    const yearNum = parseInt(year);
    const queryNum = parseInt(query);
    
    // 如果查询中包含年份
    if (!isNaN(queryNum) && queryNum >= 1900 && queryNum <= new Date().getFullYear() + 2) {
      const diff = Math.abs(yearNum - queryNum);
      if (diff === 0) return 100; // 完全匹配
      if (diff === 1) return 90;  // 相差1年
      if (diff <= 2) return 80;   // 相差2年
      if (diff <= 5) return 60;   // 相差5年
      return 30;                  // 相差5年以上
    }
    
    // 查询不包含年份，返回基于年份合理性的分数
    if (yearNum >= 1990 && yearNum <= new Date().getFullYear() + 2) {
      return 70; // 合理年份范围
    }
    
    return 30; // 异常年份
  }

  /**
   * 计算来源质量评分
   */
  private calculateSourceScore(source: string): number {
    return SOURCE_QUALITY_SCORES[source] || SOURCE_QUALITY_SCORES.default;
  }

  /**
   * 获取搜索历史管理器实例
   */
  private getSearchHistoryManager(): any {
    try {
      // 如果已经有了实例，直接返回
      if (this.searchHistoryManager) {
        return this.searchHistoryManager;
      }
      
      // 检查是否在浏览器环境且类型定义存在
      if (typeof window !== 'undefined') {
        // 动态导入搜索历史管理器（仅在浏览器环境）
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const searchHistoryModule = require('./searchHistory');
          const SearchHistoryManager = searchHistoryModule.SearchHistoryManager;
          if (SearchHistoryManager) {
            this.searchHistoryManager = SearchHistoryManager.getInstance();
          }
        } catch (importError) {
          console.warn('无法加载搜索历史管理器:', importError);
        }
      }
      
      return this.searchHistoryManager;
    } catch (error) {
      console.warn('获取搜索历史管理器失败:', error);
      return null;
    }
  }

  /**
   * 计算流行度评分
   */
  private async calculatePopularityScore(result: SearchResult): Promise<number> {
    try {
      // 获取搜索历史管理器
      const historyManager = this.getSearchHistoryManager();
      
      // 如果没有搜索历史管理器，返回基于来源和内容的默认评分
      if (!historyManager) {
        return this.calculateDefaultPopularity(result);
      }
      
      // 基于搜索历史计算流行度
      const history = historyManager.getRecentHistory(100);
      const queryCount = history.filter((item: any) => 
        item.query && (
          item.query.toLowerCase().includes(result.title.toLowerCase()) ||
          result.title.toLowerCase().includes(item.query.toLowerCase())
        )
      ).length;
      
      // 搜索历史中出现次数越多，流行度越高
      const popularityScore = Math.min(100, queryCount * 10);
      
      // 如果有豆瓣ID，可以考虑豆瓣评分
      if (result.douban_id) {
        // 这里可以集成豆瓣API获取实际评分
        // 目前返回基于ID的简单评分
        const doubanBonus = Math.min(20, Math.floor(result.douban_id % 100));
        return popularityScore + doubanBonus;
      }
      
      return popularityScore;
    } catch (error) {
      console.warn('计算流行度失败:', error);
      return this.calculateDefaultPopularity(result);
    }
  }

  /**
   * 计算默认流行度评分
   */
  private calculateDefaultPopularity(result: SearchResult): number {
    let score = 50; // 基础分数
    
    // 基于来源质量调整
    score += this.calculateSourceScore(result.source) * 0.3;
    
    // 基于标题特征调整
    if (result.title) {
      const title = result.title.toLowerCase();
      // 热门词汇加分
      if (title.includes('热门') || title.includes('最新') || title.includes('推荐')) {
        score += 10;
      }
      // 经典作品加分
      if (title.includes('经典') || title.includes('高分') || title.includes('获奖')) {
        score += 15;
      }
    }
    
    return Math.min(100, Math.max(0, score));
  }

  /**
   * 计算新鲜度评分
   */
  private calculateRecencyScore(result: SearchResult): number {
    // 基于年份计算新鲜度
    const yearNum = parseInt(result.year);
    const currentYear = new Date().getFullYear();
    
    const age = currentYear - yearNum;
    
    if (age <= 1) return 100;        // 1年内最新
    if (age <= 3) return 85;         // 3年内很新
    if (age <= 5) return 70;         // 5年内较新
    if (age <= 10) return 50;        // 10年内一般
    if (age <= 20) return 30;        // 20年内较旧
    return 10;                       // 20年以上很旧
  }

  /**
   * 计算字符串相似度（编辑距离）
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;
    
    if (len1 === 0) return len2 === 0 ? 1 : 0;
    if (len2 === 0) return 0;
    
    const matrix: number[][] = [];
    
    // 初始化矩阵
    for (let i = 0; i <= len2; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= len1; j++) {
      matrix[0][j] = j;
    }
    
    // 填充矩阵
    for (let i = 1; i <= len2; i++) {
      for (let j = 1; j <= len1; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // 替换
            matrix[i][j - 1] + 1,     // 插入
            matrix[i - 1][j] + 1      // 删除
          );
        }
      }
    }
    
    const distance = matrix[len2][len1];
    const maxLen = Math.max(len1, len2);
    return 1 - distance / maxLen;
  }

  /**
   * 去重处理
   */
  private deduplicateResults(scoredResults: Array<{result: SearchResult, scores: any}>): Array<{result: SearchResult, scores: any}> {
    const seen = new Map<string, {result: SearchResult, scores: any}>();
    
    for (const item of scoredResults) {
      const key = this.generateDeduplicationKey(item.result);
      
      if (!seen.has(key)) {
        seen.set(key, item);
      } else {
        // 如果重复，保留评分更高的
        const existing = seen.get(key);
        if (existing) {
          const existingFinalScore = this.calculateFinalScore(existing.scores);
          const currentFinalScore = this.calculateFinalScore(item.scores);
          
          if (currentFinalScore > existingFinalScore) {
            seen.set(key, item);
          }
        }
      }
    }
    
    return Array.from(seen.values());
  }

  /**
   * 生成去重键
   */
  private generateDeduplicationKey(result: SearchResult): string {
    // 基于标题和年份生成去重键
    const title = result.title.toLowerCase().replace(/\s+/g, '').trim();
    const year = result.year || '';
    return `${title}_${year}`;
  }

  /**
   * 计算综合评分
   */
  private calculateFinalScore(scores: any): number {
    const {
      titleScore,
      yearScore,
      sourceScore,
      popularityScore,
      recencyScore
    } = scores;
    
    return (
      titleScore * this.config.titleWeight +
      yearScore * this.config.yearWeight +
      sourceScore * this.config.sourceWeight +
      popularityScore * this.config.popularityWeight +
      recencyScore * this.config.recencyWeight
    );
  }

  /**
   * 优化多样性
   */
  private optimizeDiversity(scoredResults: Array<{result: SearchResult, scores: any, finalScore: number}>): Array<{result: SearchResult, scores: any, finalScore: number}> {
    // 简单的多样性优化：确保不同来源的结果都有机会展示
    const sourceLimit = Math.max(3, Math.floor(scoredResults.length * 0.3));
    const sourceCount = new Map<string, number>();
    
    const diversified: Array<{result: SearchResult, scores: any, finalScore: number}> = [];
    
    // 按评分排序，但考虑来源多样性
    for (const item of scoredResults) {
      const source = item.result.source;
      const count = sourceCount.get(source) || 0;
      
      if (count < sourceLimit || diversified.length < sourceLimit * 2) {
        diversified.push(item);
        sourceCount.set(source, count + 1);
      }
    }
    
    return diversified;
  }

  /**
   * 更新排序配置
   */
  updateConfig(newConfig: Partial<RankingConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * 获取当前配置
   */
  getConfig(): RankingConfig {
    return { ...this.config };
  }
}

// 导出默认实例
export const defaultRanker = new SearchResultRanker();