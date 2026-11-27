/**
 * 天翼云盘自动签到（令牌版）
 * - 首次运行：从环境变量 TYYP_REFRESH_TOKEN 读取刷新令牌（通过扫码登录获得）
 * - 之后运行：SDK 自动用 refreshToken 换新 accessToken 并回写 token.json
 * - token.json 通过 GitHub Actions cache 在多次运行间持久化
 */
const fs = require("fs");
const path = require("path");
const { CloudClient, FileTokenStore } = require("cloud189-sdk");

const TOKEN_PATH = path.join(__dirname, "token.json");

function seedTokenIfMissing() {
  if (fs.existsSync(TOKEN_PATH)) {
    try {
      const t = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
      if (t.refreshToken) return; // 已有有效令牌（可能来自 cache）
    } catch (_) {
      /* 文件损坏，重新播种 */
    }
  }
  const raw = (process.env.TYYP_REFRESH_TOKEN || "").trim();
  if (!raw) {
    console.error("错误：token.json 不存在且环境变量 TYYP_REFRESH_TOKEN 未设置。");
    console.error("请先在本地扫码登录获取令牌，并配置到仓库 Secrets。");
    process.exit(2);
  }
  let tokenObj;
  try {
    // Secret 可以直接放完整 token JSON（含 accessToken/refreshToken/expiresIn）
    tokenObj = JSON.parse(raw);
  } catch (_) {
    // 或者只放 refreshToken 字符串
    tokenObj = { accessToken: "", refreshToken: raw };
  }
  if (!tokenObj.refreshToken) {
    console.error("错误：令牌内容无效（缺少 refreshToken）。");
    process.exit(2);
  }
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokenObj));
  console.log("已从 Secret 播种令牌。");
}

async function main() {
  seedTokenIfMissing();
  const client = new CloudClient({ token: new FileTokenStore(TOKEN_PATH) });

  // 触发会话（自动续期）并获取容量
  const info = await client.getUserSizeInfo();
  const fmt = (v) => (typeof v === "number" && !isNaN(v) ? (v / 1024 / 1024 / 1024).toFixed(2) + " GB" : "未知");
  console.log(`登录成功! 总容量 ${fmt(info.totalSize)}，已用 ${fmt(info.usedSize)}，剩余 ${fmt(info.freeSize)}`);

  // 个人签到
  const sign = await client.userSign();
  if (sign.isSign) {
    console.log(`今日已签到过（本任务每日仅计一次），当前空间奖励：${sign.netdiskBonus}M`);
  } else {
    console.log(`签到成功! 获得 ${sign.netdiskBonus}M 空间`);
  }

  console.log("所有账户处理完成！");
}

main().catch((e) => {
  console.error("签到失败:", e.response ? `${e.response.statusCode} ${JSON.stringify(e.response.body)}` : e.message);
  process.exit(1);
});
