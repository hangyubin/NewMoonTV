// 搜索去重算法效果演示
// 这个脚本模拟了优化前后的对比效果

import { defaultRanker } from './src/lib/searchRanking';

// 模拟重复的搜索结果数据
const mockSearchResults = [
  {
    id: '1',
    title: '测试视频',
    year: '2023',
    source: 'source-a',
    douban_id: '',
    poster: 'https://example.com/poster1.jpg'
  },
  {
    id: '2',
    title: '测试视频', // 重复标题
    year: '2023',     // 重复年份
    source: 'source-b',
    douban_id: '',
    poster: 'https://example.com/poster2.jpg'
  },
  {
    id: '3',
    title: '测试视频  ', // 标题后有空格
    year: '2023',
    source: 'source-c',
    douban_id: '12345', // 豆瓣ID不同
    poster: 'https://example.com/poster3.jpg'
  },
  {
    id: '4',
    title: '测试视频',
    year: '2024', // 不同年份
    source: 'source-d',
    douban_id: '',
    poster: 'https://example.com/poster4.jpg'
  },
  {
    id: '5',
    title: '测试视频：终极版',
    year: '2023',
    source: 'source-e',
    douban_id: '',
    poster: 'https://example.com/poster5.jpg'
  }
];

console.log('=== MoonTV 搜索去重算法效果演示 ===\n');

// 展示原始数据
console.log('📊 原始搜索结果数量:', mockSearchResults.length);
mockSearchResults.forEach((result, index) => {
  console.log(`${index + 1}. ${result.title} (${result.year}) - ${result.source} - douban_id: ${result.douban_id}`);
});

// 应用去重算法
console.log('\n🔧 应用新的去重算法...');
const deduplicatedResults = defaultRanker.deduplicateSearchResults(mockSearchResults);

// 展示去重结果
console.log('\n✅ 去重后结果数量:', deduplicatedResults.length);
deduplicatedResults.forEach((result, index) => {
  console.log(`${index + 1}. ${result.title} (${result.year}) - ${result.source}`);
});

// 计算去重效果
const removedCount = mockSearchResults.length - deduplicatedResults.length;
const deduplicationRate = ((removedCount / mockSearchResults.length) * 100).toFixed(1);

console.log('\n📈 去重效果统计:');
console.log(`- 移除重复项: ${removedCount} 个`);
console.log(`- 去重率: ${deduplicationRate}%`);
console.log(`- 保留有效结果: ${deduplicatedResults.length} 个`);

// 展示去重算法的工作原理
console.log('\n🧠 去重算法工作原理:');
console.log('1. 生成多重去重键:');
console.log('   - 标题+年份组合键');
console.log('   - 豆瓣ID精确匹配键');
console.log('   - 标准化标题模糊匹配键');
console.log('   - 首字母缩写组合键');
console.log('   - 关键词组合键');

console.log('\n2. 匹配策略优先级:');
console.log('   - 优先级1: 外部ID匹配 (如豆瓣ID)');
console.log('   - 优先级2: 标题+年份精确匹配');
console.log('   - 优先级3: 标准化标题模糊匹配');
console.log('   - 优先级4: 关键词组合匹配');

console.log('\n3. 容错处理:');
console.log('   - 自动去除标题中的特殊字符和多余空格');
console.log('   - 支持标题变体和缩写匹配');
console.log('   - 智能关键词提取和匹配');

console.log('\n✨ 优化效果总结:');
console.log('- ✅ 显著减少重复播放源显示');
console.log('- ✅ 保留最相关和最新的搜索结果');
console.log('- ✅ 提升用户播放体验');
console.log('- ✅ 减少用户选择困扰');

// 导出用于其他模块使用
export { mockSearchResults, deduplicatedResults };