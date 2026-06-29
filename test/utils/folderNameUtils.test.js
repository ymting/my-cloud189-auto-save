/**
 * 文件夹名工具函数测试
 *
 * 轻量自包含测试，使用 Node.js 内置 assert 模块。
 * 运行方式：node test/utils/folderNameUtils.test.js
 *
 * 覆盖用例：
 * 1. 空值保护
 * 2. 正常追加
 * 3. 已含标记不重复（含大小写）
 * 4. 标记在中间（视为不同任务，仍追加）
 * 5. 各种边界场景
 */

const assert = require('assert');
const { appendTmdbIdToFolderName } = require('../../src/utils/folderNameUtils');

let testCount = 0;
let passCount = 0;

function test(name, fn) {
    testCount++;
    try {
        fn();
        passCount++;
        console.log(`  ✅ ${name}`);
    } catch (e) {
        console.error(`  ❌ ${name}`);
        console.error(`     ${e.message}`);
        if (e.actual !== undefined && e.expected !== undefined) {
            console.error(`     actual:   ${JSON.stringify(e.actual)}`);
            console.error(`     expected: ${JSON.stringify(e.expected)}`);
        }
        process.exitCode = 1;
    }
}

console.log('\n📋 appendTmdbIdToFolderName 测试\n');

console.log('▶ 空值保护');
test('空字符串 folderName → 返回空字符串', () => {
    assert.strictEqual(appendTmdbIdToFolderName('', 131887), '');
});
test('undefined folderName → 返回 undefined', () => {
    assert.strictEqual(appendTmdbIdToFolderName(undefined, 131887), undefined);
});
test('null folderName → 返回 null', () => {
    assert.strictEqual(appendTmdbIdToFolderName(null, 131887), null);
});
test('null tmdbId → 返回原名', () => {
    assert.strictEqual(appendTmdbIdToFolderName('狂飙', null), '狂飙');
});
test('undefined tmdbId → 返回原名', () => {
    assert.strictEqual(appendTmdbIdToFolderName('狂飙', undefined), '狂飙');
});
test('0 tmdbId → 返回原名（视为空）', () => {
    assert.strictEqual(appendTmdbIdToFolderName('狂飙', 0), '狂飙');
});
test('空字符串 tmdbId → 返回原名', () => {
    assert.strictEqual(appendTmdbIdToFolderName('狂飙', ''), '狂飙');
});

console.log('\n▶ 正常追加');
test('中文任务名 + 数字 ID', () => {
    assert.strictEqual(
        appendTmdbIdToFolderName('狂飙', 131887),
        '狂飙[tmdb-131887]'
    );
});
test('带年份任务名 + 数字 ID', () => {
    assert.strictEqual(
        appendTmdbIdToFolderName('狂飙 (2023)', 131887),
        '狂飙 (2023)[tmdb-131887]'
    );
});
test('英文任务名 + 数字 ID', () => {
    assert.strictEqual(
        appendTmdbIdToFolderName('Breaking Bad', 1396),
        'Breaking Bad[tmdb-1396]'
    );
});
test('字符串类型的 tmdbId', () => {
    assert.strictEqual(
        appendTmdbIdToFolderName('狂飙', '131887'),
        '狂飙[tmdb-131887]'
    );
});
test('电影类型同样支持', () => {
    assert.strictEqual(
        appendTmdbIdToFolderName('Avatar (2009)', 19995),
        'Avatar (2009)[tmdb-19995]'
    );
});

console.log('\n▶ 已含标记不重复');
test('小写 [tmdb-xxx] 不重复', () => {
    assert.strictEqual(
        appendTmdbIdToFolderName('狂飙[tmdb-131887]', 131887),
        '狂飙[tmdb-131887]'
    );
});
test('大写 [TMDB-XXX] 也不重复（大小写不敏感）', () => {
    assert.strictEqual(
        appendTmdbIdToFolderName('狂飙[TMDB-131887]', 131887),
        '狂飙[TMDB-131887]'
    );
});
test('混合大小写 [TmDb-Xxx] 也不重复', () => {
    assert.strictEqual(
        appendTmdbIdToFolderName('狂飙[TmDb-131887]', 131887),
        '狂飙[TmDb-131887]'
    );
});
test('已含标记 + 不同 ID 仍不重复（防误判）', () => {
    // 已含标记时一律不追加（避免一个文件夹出现两个标记）
    assert.strictEqual(
        appendTmdbIdToFolderName('狂飙[tmdb-131887]', 999),
        '狂飙[tmdb-131887]'
    );
});
test('标记前有空格也能识别', () => {
    assert.strictEqual(
        appendTmdbIdToFolderName('狂飙 [tmdb-131887]', 131887),
        '狂飙 [tmdb-131887]'
    );
});
test('标记后有空格也能识别', () => {
    assert.strictEqual(
        appendTmdbIdToFolderName('狂飙[tmdb-131887] ', 131887),
        '狂飙[tmdb-131887] '
    );
});

console.log('\n▶ 标记在中间仍追加');
test('标记在中间（视为不同任务）', () => {
    // 这种情况属于异常数据，但工具函数不处理，按需追加
    assert.strictEqual(
        appendTmdbIdToFolderName('狂飙[tmdb-1] S2', 131887),
        '狂飙[tmdb-1] S2[tmdb-131887]'
    );
});

console.log('\n▶ 边界场景');
test('纯数字任务名（极端情况）', () => {
    assert.strictEqual(
        appendTmdbIdToFolderName('2001', 13475),
        '2001[tmdb-13475]'
    );
});
test('任务名含 [ 和 ] 但不是 tmdb 标记', () => {
    assert.strictEqual(
        appendTmdbIdToFolderName('复仇者[联盟]', 24428),
        '复仇者[联盟][tmdb-24428]'
    );
});
test('任务名含 [tmdb 但不完整', () => {
    // "[tmdb" 不算完整标记，应追加
    assert.strictEqual(
        appendTmdbIdToFolderName('狂飙[tmdb', 131887),
        '狂飙[tmdb[tmdb-131887]'
    );
});

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`📊 测试结果：${passCount}/${testCount} 通过`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

if (passCount === testCount) {
    console.log('🎉 全部通过！\n');
    process.exit(0);
} else {
    console.error(`❌ ${testCount - passCount} 个测试失败\n`);
    process.exit(1);
}
