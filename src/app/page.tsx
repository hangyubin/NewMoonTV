/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, no-console */

'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo,useState } from 'react';

import {
  BangumiCalendarData,
  GetBangumiCalendarData,
} from '@/lib/bangumi.client';
// 客户端收藏 API
import {
  clearAllFavorites,
  getAllFavorites,
  getAllPlayRecords,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import { getDoubanCategories } from '@/lib/douban.client';
import { DoubanItem } from '@/lib/types';

import CapsuleSwitch from '@/components/CapsuleSwitch';
import ContinueWatching from '@/components/ContinueWatching';
import PageLayout from '@/components/PageLayout';
import ScrollableRow from '@/components/ScrollableRow';
import { useSite } from '@/components/SiteProvider';
import VideoCard from '@/components/VideoCard';

// 类型定义
type FavoriteItem = {
  id: string;
  source: string;
  title: string;
  poster: string;
  episodes: number;
  source_name: string;
  currentEpisode?: number;
  search_title?: string;
};

function HomeClient() {
  const [activeTab, setActiveTab] = useState<'home' | 'continue' | 'favorites'>('home');
  const [hotMovies, setHotMovies] = useState<DoubanItem[]>([]);
  const [hotTvShows, setHotTvShows] = useState<DoubanItem[]>([]);
  const [hotVarietyShows, setHotVarietyShows] = useState<DoubanItem[]>([]);
  const [bangumiCalendarData, setBangumiCalendarData] = useState<BangumiCalendarData[]>([]);
  const [loading, setLoading] = useState(true);
  const { announcement } = useSite();

  const [showAnnouncement, setShowAnnouncement] = useState(false);
  
  // 检查是否启用简洁模式
  const [simpleMode, setSimpleMode] = useState(false);
  const [isClient, setIsClient] = useState(false);

  // 收藏夹数据
  const [favoriteItems, setFavoriteItems] = useState<FavoriteItem[]>([]);

  // 使用 useCallback 优化初始化函数
  const initializeClient = useCallback(() => {
    setIsClient(true);
    if (typeof window !== 'undefined') {
      const savedSimpleMode = localStorage.getItem('simpleMode');
      if (savedSimpleMode !== null) {
        setSimpleMode(JSON.parse(savedSimpleMode));
      }
    }
  }, []);

  // 使用 useCallback 优化公告检查函数
  const checkAnnouncement = useCallback(() => {
    if (typeof window !== 'undefined' && announcement) {
      const hasSeenAnnouncement = localStorage.getItem('hasSeenAnnouncement');
      if (hasSeenAnnouncement !== announcement) {
        setShowAnnouncement(true);
      } else {
        setShowAnnouncement(Boolean(!hasSeenAnnouncement && announcement));
      }
    }
  }, [announcement]);

  // 使用 useCallback 优化推荐数据获取函数
  const fetchRecommendData = useCallback(async () => {
    try {
      setLoading(true);

      // 检查是否启用简洁模式
      const savedSimpleMode = localStorage.getItem('simpleMode');
      const isSimpleMode = savedSimpleMode ? JSON.parse(savedSimpleMode) : false;

      if (isSimpleMode) {
        // 简洁模式下跳过豆瓣数据获取
        setLoading(false);
        return;
      }

      // 并行获取热门电影、热门剧集和热门综艺
      const [moviesData, tvShowsData, varietyShowsData, bangumiCalendarData] =
        await Promise.all([
          getDoubanCategories({
            kind: 'movie',
            category: '热门',
            type: '全部',
          }),
          getDoubanCategories({ kind: 'tv', category: 'tv', type: 'tv' }),
          getDoubanCategories({ kind: 'tv', category: 'show', type: 'show' }),
          GetBangumiCalendarData(),
        ]);

      if (moviesData.code === 200) {
        setHotMovies(moviesData.list);
      }

      if (tvShowsData.code === 200) {
        setHotTvShows(tvShowsData.list);
      }

      if (varietyShowsData.code === 200) {
        setHotVarietyShows(varietyShowsData.list);
      }

      setBangumiCalendarData(bangumiCalendarData);
    } catch (error) {
      console.error('获取推荐数据失败:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // 使用 useCallback 优化收藏数据处理函数
  const updateFavoriteItems = useCallback(async (allFavorites: Record<string, any>) => {
    const allPlayRecords = await getAllPlayRecords();

    // 根据保存时间排序（从近到远）
    const sorted = Object.entries(allFavorites)
      .sort(([, a], [, b]) => b.save_time - a.save_time)
      .map(([key, fav]) => {
        const plusIndex = key.indexOf('+');
        const source = key.slice(0, plusIndex);
        const id = key.slice(plusIndex + 1);

        // 查找对应的播放记录，获取当前集数
        const playRecord = allPlayRecords[key];
        const currentEpisode = playRecord?.index;

        return {
          id,
          source,
          title: fav.title,
          year: fav.year,
          poster: fav.cover,
          episodes: fav.total_episodes,
          source_name: fav.source_name,
          currentEpisode,
          search_title: fav?.search_title,
        } as FavoriteItem;
      });
    setFavoriteItems(sorted);
  }, []);

  // 使用 useCallback 优化收藏数据加载函数
  const loadFavorites = useCallback(async () => {
    const allFavorites = await getAllFavorites();
    await updateFavoriteItems(allFavorites);
  }, [updateFavoriteItems]);

  // 使用 useCallback 优化公告关闭函数
  const handleCloseAnnouncement = useCallback((announcement: string) => {
    setShowAnnouncement(false);
    localStorage.setItem('hasSeenAnnouncement', announcement); // 记录已查看弹窗
  }, []);

  // 使用 useMemo 优化今日番剧数据
  const todayAnimes = useMemo(() => {
    if (loading || !bangumiCalendarData.length) return [];

    // 获取当前日期对应的星期
    const today = new Date();
    const weekdays = [
      'Sun',
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
    ];
    const currentWeekday = weekdays[today.getDay()];

    // 找到当前星期对应的番剧数据
    return bangumiCalendarData.find(
      (item) => item.weekday.en === currentWeekday
    )?.items || [];
  }, [bangumiCalendarData, loading]);

  // 初始化效果
  useEffect(() => {
    initializeClient();
    checkAnnouncement();
    fetchRecommendData();
  }, [initializeClient, checkAnnouncement, fetchRecommendData]);

  // 当切换到收藏夹时加载收藏数据
  useEffect(() => {
    if (activeTab !== 'favorites') return;

    loadFavorites();

    // 监听收藏更新事件
    const unsubscribe = subscribeToDataUpdates(
      'favoritesUpdated',
      (newFavorites: Record<string, any>) => {
        updateFavoriteItems(newFavorites);
      }
    );

    return unsubscribe;
  }, [activeTab, loadFavorites, updateFavoriteItems]);

  // 使用 useMemo 优化加载状态占位符
  const loadingPlaceholders = useMemo(() => 
    Array.from({ length: 8 }).map((_, index) => (
      <div
        key={index}
        className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
      >
        <div className='relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-gray-200 animate-pulse dark:bg-gray-800'>
          <div className='absolute inset-0 bg-gray-300 dark:bg-gray-700'></div>
        </div>
        <div className='mt-2 h-4 bg-gray-200 rounded animate-pulse dark:bg-gray-800'></div>
      </div>
    )), []);

  // 渲染电影部分
  const renderMoviesSection = useMemo(() => (
    <section className='mb-8'>
      <div className='mb-4 flex items-center justify-between'>
        <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
          热门电影
        </h2>
        <Link
          href='/douban?type=movie'
          className='flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
        >
          查看更多
          <ChevronRight className='w-4 h-4 ml-1' />
        </Link>
      </div>
      <ScrollableRow>
        {loading ? loadingPlaceholders : hotMovies.map((movie, index) => (
          <div
            key={index}
            className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
          >
            <VideoCard
              from='douban'
              title={movie.title}
              poster={movie.poster}
              douban_id={Number(movie.id)}
              rate={movie.rate}
              year={movie.year}
              type='movie'
            />
          </div>
        ))}
      </ScrollableRow>
    </section>
  ), [loading, loadingPlaceholders, hotMovies]);

  // 渲染剧集部分
  const renderTvShowsSection = useMemo(() => (
    <section className='mb-8'>
      <div className='mb-4 flex items-center justify-between'>
        <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
          热门剧集
        </h2>
        <Link
          href='/douban?type=tv'
          className='flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
        >
          查看更多
          <ChevronRight className='w-4 h-4 ml-1' />
        </Link>
      </div>
      <ScrollableRow>
        {loading ? loadingPlaceholders : hotTvShows.map((show, index) => (
          <div
            key={index}
            className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
          >
            <VideoCard
              from='douban'
              title={show.title}
              poster={show.poster}
              douban_id={Number(show.id)}
              rate={show.rate}
              year={show.year}
            />
          </div>
        ))}
      </ScrollableRow>
    </section>
  ), [loading, loadingPlaceholders, hotTvShows]);

  // 渲染新番部分
  const renderAnimeSection = useMemo(() => (
    <section className='mb-8'>
      <div className='mb-4 flex items-center justify-between'>
        <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
          新番放送
        </h2>
        <Link
          href='/douban?type=anime'
          className='flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
        >
          查看更多
          <ChevronRight className='w-4 h-4 ml-1' />
        </Link>
      </div>
      <ScrollableRow>
        {loading ? loadingPlaceholders : todayAnimes.map((anime, index) => (
          <div
            key={`${anime.id}-${index}`}
            className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
          >
            <VideoCard
              from='douban'
              title={anime.name_cn || anime.name}
              poster={
                anime.images.large ||
                anime.images.common ||
                anime.images.medium ||
                anime.images.small ||
                anime.images.grid
              }
              douban_id={anime.id}
              rate={anime.rating?.score?.toString() || ''}
              year={anime.air_date?.split('-')?.[0] || ''}
              isBangumi={true}
            />
          </div>
        ))}
      </ScrollableRow>
    </section>
  ), [loading, loadingPlaceholders, todayAnimes]);

  // 渲染综艺部分
  const renderVarietySection = useMemo(() => (
    <section className='mb-8'>
      <div className='mb-4 flex items-center justify-between'>
        <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
          热门综艺
        </h2>
        <Link
          href='/douban?type=show'
          className='flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
        >
          查看更多
          <ChevronRight className='w-4 h-4 ml-1' />
        </Link>
      </div>
      <ScrollableRow>
        {loading ? loadingPlaceholders : hotVarietyShows.map((show, index) => (
          <div
            key={index}
            className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
          >
            <VideoCard
              from='douban'
              title={show.title}
              poster={show.poster}
              douban_id={Number(show.id)}
              rate={show.rate}
              year={show.year}
            />
          </div>
        ))}
      </ScrollableRow>
    </section>
  ), [loading, loadingPlaceholders, hotVarietyShows]);

  // 渲染首页内容
  const renderHomeContent = useMemo(() => (
    <>
      {renderMoviesSection}
      {renderTvShowsSection}
      {renderAnimeSection}
      {renderVarietySection}
    </>
  ), [renderMoviesSection, renderTvShowsSection, renderAnimeSection, renderVarietySection]);

  // 渲染继续观看内容 - 修复：移除多余的标题
  const renderContinueContent = useMemo(() => (
    <ContinueWatching />
  ), []);

  // 渲染收藏夹内容
  const renderFavoritesContent = useMemo(() => (
    <section className='mb-8'>
      <div className='mb-4 flex items-center justify-between'>
        <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
          我的收藏
        </h2>
        {favoriteItems.length > 0 && (
          <button
            className='text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            onClick={async () => {
              await clearAllFavorites();
              setFavoriteItems([]);
            }}
          >
            清空
          </button>
        )}
      </div>
      <div className='justify-start grid grid-cols-3 gap-x-2 gap-y-14 sm:gap-y-20 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8'>
        {favoriteItems.map((item) => (
          <div key={item.id + item.source} className='w-full'>
            <VideoCard
              query={item.search_title}
              {...item}
              from='favorite'
              type={item.episodes > 1 ? 'tv' : ''}
            />
          </div>
        ))}
        {favoriteItems.length === 0 && (
          <div className='col-span-full text-center text-gray-500 py-8 dark:text-gray-400'>
            暂无收藏内容
          </div>
        )}
      </div>
    </section>
  ), [favoriteItems]);

  // 根据当前激活的标签渲染内容
  const renderActiveContent = useMemo(() => {
    switch (activeTab) {
      case 'home':
        return isClient && !simpleMode ? renderHomeContent : (
          <div className='text-center text-gray-500 py-8 dark:text-gray-400'>
            简洁模式下只显示继续观看和收藏夹
          </div>
        );
      case 'continue':
        return renderContinueContent;
      case 'favorites':
        return renderFavoritesContent;
      default:
        return renderHomeContent;
    }
  }, [activeTab, isClient, simpleMode, renderHomeContent, renderContinueContent, renderFavoritesContent]);

  return (
    <PageLayout>
      <div className='px-2 sm:px-10 py-4 sm:py-8 overflow-visible'>
        {/* 顶部 Tab 切换 - 三合一导航 */}
        <div className='mb-8 flex justify-center'>
          <CapsuleSwitch
            options={[
              { label: '首页', value: 'home' },
              { label: '继续观看', value: 'continue' },
              { label: '收藏夹', value: 'favorites' },
            ]}
            active={activeTab}
            onChange={(value) => setActiveTab(value as 'home' | 'continue' | 'favorites')}
          />
        </div>

        <div className='max-w-[95%] mx-auto'>
          {renderActiveContent}
        </div>
      </div>
      
      {/* 公告弹窗 */}
      {announcement && showAnnouncement && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm dark:bg-black/70 p-4 transition-opacity duration-300 ${
            showAnnouncement ? '' : 'opacity-0 pointer-events-none'
          }`}
        >
          <div className='w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-gray-900 transform transition-all duration-300 hover:shadow-2xl'>
            <div className='flex justify-between items-start mb-4'>
              <h3 className='text-2xl font-bold tracking-tight text-gray-800 dark:text-white border-b border-green-500 pb-1'>
                提示
              </h3>
              <button
                onClick={() => handleCloseAnnouncement(announcement)}
                className='text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-white transition-colors'
                aria-label='关闭'
              ></button>
            </div>
            <div className='mb-6'>
              <div className='relative overflow-hidden rounded-lg mb-4 bg-green-50 dark:bg-green-900/20'>
                <div className='absolute inset-y-0 left-0 w-1.5 bg-green-500 dark:bg-green-400'></div>
                <p className='ml-4 text-gray-600 dark:text-gray-300 leading-relaxed'>
                  {announcement}
                </p>
              </div>
            </div>
            <button
              onClick={() => handleCloseAnnouncement(announcement)}
              className='w-full rounded-lg bg-gradient-to-r from-green-600 to-green-700 px-4 py-3 text-white font-medium shadow-md hover:shadow-lg hover:from-green-700 hover:to-green-800 dark:from-green-600 dark:to-green-700 dark:hover:from-green-700 dark:hover:to-green-800 transition-all duration-300 transform hover:-translate-y-0.5'
            >
              我知道了
            </button>
          </div>
        </div>
      )}
    </PageLayout>
  );
}

export default function Home() {
  return (
    <Suspense>
      <HomeClient />
    </Suspense>
  );
}
