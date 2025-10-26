// src/update-stats.js
// Simple script: fetches MegaETH metrics and updates README.md
import fs from "fs/promises";

const RPC = process.env.RPC_URL || "https://carrot.megaeth.com/rpc";

async function rpc(method, params = []) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  });
  const j = await res.json();
  if (j.error) throw new Error(JSON.stringify(j.error));
  return j.result;
}

const hexToInt = (hex) => Number(BigInt(hex));

async function getLatestBlockNumber() {
  const hex = await rpc("eth_blockNumber");
  return hexToInt(hex);
}

async function getTxCount(blockNumber) {
  const hexBlock = "0x" + blockNumber.toString(16);
  const res = await rpc("eth_getBlockTransactionCountByNumber", [hexBlock]);
  return hexToInt(res);
}

async function getGasPriceGwei() {
  const gp = await rpc("eth_gasPrice");
  return Number(BigInt(gp)) / 1e9;
}

async function getBaseFeeAvg(blockCount = 20) {
  const latest = await getLatestBlockNumber();
  const hexLatest = "0x" + latest.toString(16);
  const res = await rpc("eth_feeHistory", [blockCount, hexLatest, []]);
  const baseFees = res.baseFeePerGas.map((h) => Number(BigInt(h)) / 1e9);
  const arr = baseFees.slice(0, -1);
  return arr.reduce((a, b) => a + b, 0) / Math.max(arr.length, 1);
}

async function estimateTps(windowSeconds = 10) {
  const latest = await getLatestBlockNumber();
  const blocks = Array.from({ length: windowSeconds }, (_, i) => latest - i);
  const counts = await Promise.all(blocks.map((b) => getTxCount(b)));
  const sum = counts.reduce((a, b) => a + b, 0);
  return sum / Math.max(counts.length, 1);
}

function formatUTCnow() {
  return new Date().toISOString().replace("T", " ").replace("Z", " UTC");
}

async function run() {
  try {
    const latest = await getLatestBlockNumber();
    const tps = await estimateTps(10);
    const gas = await getGasPriceGwei();
    const baseFee = await getBaseFeeAvg(20);
    const now = formatUTCnow();

    const section = [
      `**Updated:** ${now}`,
      `- Latest EVM block: **${latest}**`,
      `- TPS (approx, 10s window): **${tps.toFixed(2)}**`,
      `- Gas price: **${gas.toFixed(4)} gwei**`,
      `- Avg base fee (20): **${baseFee.toFixed(4)} gwei**`
    ].join("\n");

    const readme = await fs.readFile("README.md", "utf8");
    const start = "<!-- STATS_START -->";
    const end = "<!-- STATS_END -->";
    const before = readme.split(start)[0];
    const after = readme.split(end)[1] || "";
    const newReadme = `${before}${start}\n${section}\n${end}${after}`;
    await fs.writeFile("README.md", newReadme, "utf8");
    console.log("README updated ✅");
  } catch (e) {
    console.error("Error updating stats:", e.message);
    process.exit(1);
  }
}

run();
