'use client';

import { Search, TrendingUp } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';

interface TrendingItem {
  keyword: string;
  count?: number;
  category: string;
  rank?: number;
}

interface TrendingSearchProps {
  onSearch: (keyword: string) => void;
  className?: string;
  showCategoryFilter?: boolean;
  maxItems?: number;
}

const TRENDING_CATEGORIES = ['全部', '电影', '电视剧', '动漫', '综艺', '纪录片', '其他'];

const TrendingSearch: React.FC<TrendingSearchProps> = ({
  onSearch,
  className = '',
  showCategoryFilter = true,
  maxItems = 10
}) => {
  const [trendingData, setTrendingData] = useState<TrendingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('全部');
  const [isExpanded, setIsExpanded] = useState(false);

  /**
   * 获取热门搜索数据
   */
  const fetchTrendingSearches = useCallback(async (category = '全部', limit = maxItems) => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        category: category === '全部' ? '' : category,
        limit: limit.toString()
      });

      const response = await fetch(`/api/trending-search?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: TrendingItem[] = await response.json();
      
      // 添加排名信息
      const dataWithRank = data.map((item, index) => ({
        ...item,
        rank: index + 1
      }));

      setTrendingData(dataWithRank);
    } catch (err) {
      console.error('获取热门搜索失败:', err);
      setError('获取热门搜索失败，请稍后再试');
      
      // 使用默认的热门搜索作为备用
      setTrendingData(getDefaultTrending());
    } finally {
      setLoading(false);
    }
  }, [maxItems]);

  /**
   * 获取默认热门搜索数据
   */
  const getDefaultTrending = useCallback((): TrendingItem[] => {
    const defaultData = [
      { keyword: '热门电影', count: 100, category: '电影' },
      { keyword: '最新电视剧', count: 85, category: '电视剧' },
      { keyword: '经典动漫', count: 75, category: '动漫' },
      { keyword: '综艺节目', count: 60, category: '综艺' },
      { keyword: '纪录片', count: 45, category: '纪录片' },
      { keyword: '动作片', count: 40, category: '电影' },
      { keyword: '爱情片', count: 35, category: '电影' },
      { keyword: '悬疑剧', count: 30, category: '电视剧' },
      { keyword: '科幻片', count: 25, category: '电影' },
      { keyword: '喜剧片', count: 20, category: '电影' },
    ];

    return defaultData.map((item, index) => ({
      ...item,
      rank: index + 1
    }));
  }, []);

  /**
   * 处理类别变更
   */
  const handleCategoryChange = useCallback((category: string) => {
    setSelectedCategory(category);
    fetchTrendingSearches(category);
  }, [fetchTrendingSearches]);

  /**
   * 处理搜索点击
   */
  const handleSearchClick = useCallback(async (keyword: string) => {
    try {
      // 记录搜索
      await fetch('/api/trending-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          keyword,
          category: selectedCategory === '全部' ? '其他' : selectedCategory,
          timestamp: Date.now()
        }),
      });
    } catch (err) {
      // 静默处理记录失败的情况
      console.warn('记录热门搜索失败:', err);
    }

    // 执行搜索
    onSearch(keyword);
    
    // 折叠展开的列表
    if (isExpanded) {
      setIsExpanded(false);
    }
  }, [selectedCategory, onSearch, isExpanded]);

  /**
   * 组件挂载时获取数据
   */
  useEffect(() => {
    fetchTrendingSearches(selectedCategory);
  }, [fetchTrendingSearches, selectedCategory]);

  /**
   * 获取显示的数据
   */
  const getDisplayData = useCallback(() => {
    if (isExpanded) {
      return trendingData;
    }
    return trendingData.slice(0, 6); // 默认显示6条
  }, [trendingData, isExpanded]);

  /**
   * 获取排名徽章样式
   */
  const getRankBadgeStyle = useCallback((rank: number) => {
    if (rank <= 3) {
      return 'bg-gradient-to-r from-yellow-400 to-orange-500 text-white';
    } else if (rank <= 10) {
      return 'bg-gradient-to-r from-blue-400 to-purple-500 text-white';
    } else {
      return 'bg-gray-200 text-gray-600';
    }
  }, []);

  /**
   * 获取热门度指示器样式
   */
  const getHotnessIndicator = useCallback((count = 0) => {
    const maxCount = Math.max(...trendingData.map(item => item.count || 0), 1);
    const intensity = Math.min(count / maxCount, 1);
    
    if (intensity > 0.8) {
      return 'text-red-500';
    } else if (intensity > 0.5) {
      return 'text-orange-500';
    } else if (intensity > 0.2) {
      return 'text-yellow-500';
    } else {
      return 'text-gray-400';
    }
  }, [trendingData]);

  return (
    <div className={`bg-white rounded-lg shadow-md p-4 ${className}`}>
      {/* 标题和操作按钮 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-orange-500" />
          <h3 className="text-lg font-semibold text-gray-800">热门搜索</h3>
        </div>
        
        {trendingData.length > 6 && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-sm text-blue-500 hover:text-blue-600 transition-colors"
          >
            {isExpanded ? '收起' : `展开全部 (${trendingData.length})`}
          </button>
        )}
      </div>

      {/* 分类筛选 */}
      {showCategoryFilter && (
        <div className="flex flex-wrap gap-2 mb-4">
          {TRENDING_CATEGORIES.map((category) => (
            <button
              key={category}
              onClick={() => handleCategoryChange(category)}
              className={`px-3 py-1 text-sm rounded-full transition-colors ${
                selectedCategory === category
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      )}

      {/* 加载状态 */}
      {loading && (
        <div className="flex justify-center items-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <span className="ml-2 text-gray-500">加载中...</span>
        </div>
      )}

      {/* 错误状态 */}
      {error && !loading && (
        <div className="text-center py-8">
          <div className="text-red-500 mb-2">{error}</div>
          <button
            onClick={() => fetchTrendingSearches(selectedCategory)}
            className="text-blue-500 hover:text-blue-600 text-sm"
          >
            重试
          </button>
        </div>
      )}

      {/* 热门搜索列表 */}
      {!loading && !error && (
        <div className="space-y-2">
          {getDisplayData().map((item, index) => (
            <div
              key={`${item.keyword}-${index}`}
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer group"
              onClick={() => handleSearchClick(item.keyword)}
            >
              {/* 排名徽章 */}
              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${getRankBadgeStyle(item.rank || index + 1)}`}>
                {item.rank || index + 1}
              </div>

              {/* 关键词和分类 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-800 truncate group-hover:text-blue-600 transition-colors">
                    {item.keyword}
                  </span>
                  {item.category && item.category !== '其他' && (
                    <span className="flex-shrink-0 px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                      {item.category}
                    </span>
                  )}
                </div>
                
                {item.count && item.count > 0 && (
                  <div className="flex items-center gap-1 mt-1">
                    <TrendingUp className={`w-3 h-3 ${getHotnessIndicator(item.count)}`} />
                    <span className="text-xs text-gray-500">
                      {item.count} 次搜索
                    </span>
                  </div>
                )}
              </div>

              {/* 搜索图标 */}
              <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <Search className="w-4 h-4 text-gray-400" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 空状态 */}
      {!loading && !error && trendingData.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <TrendingUp className="w-12 h-12 mx-auto mb-2 opacity-30" />
          <p>暂无热门搜索数据</p>
        </div>
      )}

      {/* 底部操作栏 */}
      {!loading && !error && trendingData.length > 0 && (
        <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-100">
          <div className="text-xs text-gray-500">
            最后更新: {new Date().toLocaleString('zh-CN')}
          </div>
          
          <button
            onClick={() => fetchTrendingSearches(selectedCategory)}
            className="text-xs text-blue-500 hover:text-blue-600 transition-colors"
            disabled={loading}
          >
            刷新
          </button>
        </div>
      )}
    </div>
  );
};

export default TrendingSearch;