'use client';

import React, { useCallback,useEffect, useRef, useState } from 'react';

import { SearchHistoryManager } from '@/lib/searchHistory';

interface SearchSuggestionsProps {
  query: string;
  isVisible: boolean;
  onSelect: (suggestion: string) => void;
  onClose: () => void;
  enableTrendingSearch?: boolean;
  maxTrendingItems?: number;
}

interface SuggestionItem {
  text: string;
  type: 'history' | 'suggestion' | 'trending';
  category?: string;
  count?: number;
}

interface CachedSuggestions {
  [query: string]: {
    data: { suggestions: string[]; hasMore: boolean };
    timestamp: number;
  };
}

const STORAGE_KEY = 'search_suggestions_cache';
const CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存
const SUGGESTIONS_CACHE_LIMIT = 50; // 最多缓存50个查询的建议
const DEBOUNCE_DELAY = 250; // 优化防抖时间，从300ms减少到250ms

export default function SearchSuggestions({
  query,
  isVisible,
  onSelect,
  onClose,
  enableTrendingSearch = true,
  maxTrendingItems = 5,
}: SearchSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isEnabled, setIsEnabled] = useState<boolean>(true);
  const [trendingData, setTrendingData] = useState<SuggestionItem[]>([]);
  const [loadingTrending, setLoadingTrending] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 从本地缓存获取建议
  const getCachedSuggestions = useCallback((query: string): { suggestions: string[]; hasMore: boolean } | null => {
    try {
      const cacheStr = localStorage.getItem(STORAGE_KEY);
      if (!cacheStr) return null;
      
      const cache: CachedSuggestions = JSON.parse(cacheStr);
      const cached = cache[query.toLowerCase()];
      
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return cached.data;
      }
      
      // 清理过期缓存
      if (cached) {
        delete cache[query.toLowerCase()];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
      }
    } catch (error) {
      console.warn('读取建议缓存失败:', error);
    }
    return null;
  }, []);

  // 缓存建议到本地存储
  const cacheSuggestions = useCallback((query: string, data: { suggestions: string[]; hasMore: boolean }) => {
    try {
      let cache: CachedSuggestions = {};
      const cacheStr = localStorage.getItem(STORAGE_KEY);
      
      if (cacheStr) {
        try {
          cache = JSON.parse(cacheStr);
        } catch {
          // 缓存数据损坏，清除
          cache = {};
        }
      }

      // 清理过旧缓存，限制缓存数量
      const queries = Object.keys(cache);
      if (queries.length >= SUGGESTIONS_CACHE_LIMIT) {
        const oldestQuery = queries.reduce((oldest, current) => 
          cache[oldest].timestamp < cache[current].timestamp ? oldest : current
        );
        delete cache[oldestQuery];
      }

      cache[query.toLowerCase()] = {
        data,
        timestamp: Date.now(),
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
    } catch (error) {
      console.warn('缓存建议失败:', error);
    }
  }, []);

  // 优化的搜索历史获取
  const fetchSearchHistory = useCallback(() => {
    try {
      const searchHistoryManager = new SearchHistoryManager();
      const history = searchHistoryManager.getRecentHistory(5);
      if (history && history.length > 0) {
        return history.map(item => ({
          text: item.query,
          type: 'history' as const
        }));
      }
    } catch (error) {
      console.warn('获取搜索历史失败:', error);
    }
    return [];
  }, []);

  // 获取热门搜索数据
  const fetchTrendingSearches = useCallback(async () => {
    if (!enableTrendingSearch) return [];

    try {
      setLoadingTrending(true);
      const response = await fetch(`/api/trending-search?limit=${maxTrendingItems}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.map((item: { keyword: string; category: string; count: number }) => ({
        text: item.keyword,
        type: 'trending' as const,
        category: item.category,
        count: item.count
      }));
    } catch (error) {
      console.warn('获取热门搜索失败:', error);
      // 使用默认热门搜索作为备用
      return [
        { text: '热门电影', type: 'trending' as const, category: '电影', count: 100 },
        { text: '最新电视剧', type: 'trending' as const, category: '电视剧', count: 85 },
        { text: '经典动漫', type: 'trending' as const, category: '动漫', count: 75 },
        { text: '综艺节目', type: 'trending' as const, category: '综艺', count: 60 },
        { text: '纪录片', type: 'trending' as const, category: '纪录片', count: 45 },
      ].slice(0, maxTrendingItems);
    } finally {
      setLoadingTrending(false);
    }
  }, [enableTrendingSearch, maxTrendingItems]);

  // 处理建议项选择
  const handleSuggestionSelect = useCallback(async (keyword: string, type: 'history' | 'suggestion' | 'trending') => {
    try {
      // 如果选择的是热门搜索，记录到服务器
      if (type === 'trending') {
        await fetch('/api/trending-search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            keyword,
            category: '其他', // 默认分类
            timestamp: Date.now()
          }),
        });
      }
    } catch (error) {
      // 静默处理记录失败的情况
      console.warn('记录搜索失败:', error);
    }

    // 执行搜索
    onSelect(keyword);
  }, [onSelect]);

  // 流式获取建议
  const fetchSuggestionsFromAPI = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSuggestions([]);
      return;
    }

    // 检查缓存
    const cached = getCachedSuggestions(searchQuery);
    if (cached) {
      setSuggestions(cached.suggestions.map(text => ({ text, type: 'suggestion' as const })));
      return;
    }

    // 取消之前的请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // 创建新的 AbortController
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      setSelectedIndex(-1);

      // 使用重试机制
      let retryCount = 0;
      const maxRetries = 2;
      
      while (retryCount <= maxRetries) {
        try {
          const response = await fetch('/api/search-suggestions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query: searchQuery }),
            signal: controller.signal,
          });

          if (!response.ok) {
            if (response.status >= 500 && retryCount < maxRetries) {
              retryCount++;
              await new Promise(resolve => setTimeout(resolve, 500 * retryCount));
              continue;
            }
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const data: { suggestions: string[]; hasMore: boolean } = await response.json();
          
          if (controller.signal.aborted) {
            return;
          }

          const formattedSuggestions = data.suggestions?.map(text => ({ 
            text, 
            type: 'suggestion' as const 
          })) || [];
          setSuggestions(formattedSuggestions);
          
          // 缓存结果
          cacheSuggestions(searchQuery, data);
          break;
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            return;
          }
          
          if (retryCount >= maxRetries) {
            console.error('获取搜索建议失败:', error);
            setSuggestions([]);
            break;
          }
          
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, 500 * retryCount));
        }
      }
    } finally {
      if (!controller.signal.aborted) {
        // 请求完成
      }
    }
  }, [getCachedSuggestions, cacheSuggestions]);

  // 加载搜索建议设置
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedEnableSearchSuggestions = localStorage.getItem('enableSearchSuggestions');
      if (savedEnableSearchSuggestions !== null) {
        setIsEnabled(savedEnableSearchSuggestions === 'true');
      }
      
      // 监听设置变化事件，实现实时更新
      const handleSettingsChange = (event: Event) => {
        const customEvent = event as CustomEvent<{ enableSearchSuggestions: boolean }>;
        if (customEvent.detail?.enableSearchSuggestions !== undefined) {
          setIsEnabled(customEvent.detail.enableSearchSuggestions);
        }
      };
      
      window.addEventListener('searchSettingsChanged', handleSettingsChange);
      
      return () => {
        window.removeEventListener('searchSettingsChanged', handleSettingsChange);
      };
    }
  }, []);

  // 防抖触发
  const debouncedFetchSuggestions = useCallback(
    (searchQuery: string) => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        if (searchQuery.trim() && isVisible && isEnabled) {
          setSuggestions([]); // 新查询清空旧数据
          fetchSuggestionsFromAPI(searchQuery);
        } else {
          setSuggestions([]);
          setSelectedIndex(-1);
        }
      }, DEBOUNCE_DELAY);
    },
    [isVisible, isEnabled, fetchSuggestionsFromAPI]
  );

  // 初始化热门搜索数据
  useEffect(() => {
    const initData = async () => {
      if (enableTrendingSearch) {
        const trending = await fetchTrendingSearches();
        setTrendingData(trending);
      }
    };
    
    if (isVisible && isEnabled) {
      initData();
    }
  }, [enableTrendingSearch, isVisible, isEnabled, fetchTrendingSearches, handleSuggestionSelect]);

  useEffect(() => {
    if (!query.trim() || !isVisible || !isEnabled) {
      setSuggestions([]);
      setSelectedIndex(-1);
      return;
    }
    
    // 如果输入较短，显示搜索历史和热门搜索
    if (query.trim().length < 2) {
      const history = fetchSearchHistory();
      const initialSuggestions = [];
      
      if (enableTrendingSearch && trendingData.length > 0) {
        initialSuggestions.push({
          text: '--- 热门搜索 ---',
          type: 'trending' as const,
          category: 'header'
        });
        initialSuggestions.push(...trendingData.slice(0, maxTrendingItems));
      }
      
      if (history.length > 0) {
        if (enableTrendingSearch) {
          initialSuggestions.push({
            text: '--- 搜索历史 ---',
            type: 'history' as const,
            category: 'header'
          });
        }
        initialSuggestions.push(...history);
      }
      
      setSuggestions(initialSuggestions);
      return;
    }

    debouncedFetchSuggestions(query);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [query, isVisible, isEnabled, debouncedFetchSuggestions, fetchSearchHistory, enableTrendingSearch, trendingData, maxTrendingItems]);

  // 键盘导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isVisible || suggestions.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < suggestions.length - 1 ? prev + 1 : 0
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : suggestions.length - 1
          );
          break;
        case 'Enter':
          e.preventDefault();
          if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
            const selectedSuggestion = suggestions[selectedIndex];
            handleSuggestionSelect(selectedSuggestion.text, selectedSuggestion.type);
          } else {
            onSelect(query);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, query, suggestions, selectedIndex, onSelect, onClose, handleSuggestionSelect]);

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };

    if (isVisible) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isVisible, onClose]);

  if (!isVisible || !isEnabled || suggestions.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="absolute top-full left-0 right-0 z-50 mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 max-h-80 overflow-y-auto"
    >
      {suggestions.map((suggestion, index) => {
        // 头部标签不可点击
        if (suggestion.category === 'header') {
          return (
            <div
              key={`header-${index}`}
              className="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600"
            >
              {suggestion.text}
            </div>
          );
        }

        // 获取图标样式
        const getIconAndStyle = () => {
          switch (suggestion.type) {
            case 'trending':
              return {
                icon: '🔥',
                iconClass: 'text-red-500',
                textClass: 'text-gray-700 dark:text-gray-300'
              };
            case 'history':
              return {
                icon: '⏰',
                iconClass: 'text-blue-500',
                textClass: 'text-gray-600 dark:text-gray-400'
              };
            case 'suggestion':
            default:
              return {
                icon: '🔍',
                iconClass: 'text-gray-500',
                textClass: 'text-gray-700 dark:text-gray-300'
              };
          }
        };

        const { icon, iconClass, textClass } = getIconAndStyle();

        return (
          <button
            key={`suggestion-${suggestion.text}-${index}`}
            onClick={() => onSelect(suggestion.text)}
            onMouseEnter={() => setSelectedIndex(index)}
            className={`w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-150 flex items-center gap-3 ${
              selectedIndex === index ? 'bg-gray-100 dark:bg-gray-700' : ''
            }`}
          >
            {/* 图标 */}
            <span className={`text-sm ${iconClass} flex-shrink-0`}>
              {icon}
            </span>
            
            {/* 文本内容 */}
            <span className={`flex-1 text-sm truncate ${textClass}`}>
              {suggestion.text}
            </span>
            
            {/* 分类标签 */}
            {suggestion.category && suggestion.category !== 'header' && (
              <span className="flex-shrink-0 px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300 rounded">
                {suggestion.category}
              </span>
            )}
            
            {/* 热门度指示器 */}
            {suggestion.count && suggestion.count > 0 && (
              <span className="flex-shrink-0 text-xs text-gray-400">
                {suggestion.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}