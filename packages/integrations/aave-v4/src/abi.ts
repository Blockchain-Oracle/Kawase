// The slices of the Aave V4 interfaces Kawase reads and calls (github.com/aave/aave-v4: src/spoke/interfaces/ISpoke.sol,
// src/hub/interfaces/IHub.sol + IHubBase.sol, src/spoke/interfaces/IAaveOracle.sol). Checked against the Main Spoke
// on Arc mainnet 2026-10-02: getReserve / getReserveConfig / getDynamicReserveConfig / getLiquidationConfig decode.
import { parseAbi } from "viem";

export const spokeAbi = parseAbi([
  "struct Reserve { address underlying; address hub; uint16 assetId; uint8 decimals; uint24 collateralRisk; uint8 flags; uint32 dynamicConfigKey; }",
  "struct ReserveConfig { uint24 collateralRisk; bool paused; bool frozen; bool borrowable; bool receiveSharesEnabled; }",
  "struct DynamicReserveConfig { uint16 collateralFactor; uint32 maxLiquidationBonus; uint16 liquidationFee; }",
  "struct LiquidationConfig { uint128 targetHealthFactor; uint64 healthFactorForMaxBonus; uint16 liquidationBonusFactor; }",
  "struct UserAccountData { uint256 riskPremium; uint256 avgCollateralFactor; uint256 healthFactor; uint256 totalCollateralValue; uint256 totalDebtValueRay; uint256 activeCollateralCount; uint256 borrowCount; }",
  "struct PremiumDelta { int256 sharesDelta; int256 offsetRayDelta; uint256 restoredPremiumRay; }",
  "function getReserveCount() view returns (uint256)",
  "function getReserve(uint256 reserveId) view returns (Reserve)",
  "function getReserveConfig(uint256 reserveId) view returns (ReserveConfig)",
  "function getDynamicReserveConfig(uint256 reserveId, uint32 dynamicConfigKey) view returns (DynamicReserveConfig)",
  "function getReserveSuppliedAssets(uint256 reserveId) view returns (uint256)",
  "function getReserveTotalDebt(uint256 reserveId) view returns (uint256)",
  "function getLiquidationConfig() view returns (LiquidationConfig)",
  "function getUserReserveStatus(uint256 reserveId, address user) view returns (bool, bool)",
  "function getUserSuppliedAssets(uint256 reserveId, address user) view returns (uint256)",
  "function getUserTotalDebt(uint256 reserveId, address user) view returns (uint256)",
  "function getUserAccountData(address user) view returns (UserAccountData)",
  "function ORACLE() view returns (address)",
  "function supply(uint256 reserveId, uint256 amount, address onBehalfOf) returns (uint256, uint256)",
  "function withdraw(uint256 reserveId, uint256 amount, address onBehalfOf) returns (uint256, uint256)",
  "function borrow(uint256 reserveId, uint256 amount, address onBehalfOf) returns (uint256, uint256)",
  "function repay(uint256 reserveId, uint256 amount, address onBehalfOf) returns (uint256, uint256)",
  "function setUsingAsCollateral(uint256 reserveId, bool usingAsCollateral, address onBehalfOf)",
  "event Supply(uint256 indexed reserveId, address indexed caller, address indexed user, uint256 suppliedShares, uint256 suppliedAmount)",
  "event Withdraw(uint256 indexed reserveId, address indexed caller, address indexed user, uint256 withdrawnShares, uint256 withdrawnAmount)",
  "event Borrow(uint256 indexed reserveId, address indexed caller, address indexed user, uint256 drawnShares, uint256 drawnAmount)",
  "event Repay(uint256 indexed reserveId, address indexed caller, address indexed user, uint256 drawnShares, uint256 totalAmountRepaid, PremiumDelta premiumDelta)",
  "event LiquidationCall(uint256 indexed collateralReserveId, uint256 indexed debtReserveId, address indexed user, address liquidator, bool receiveShares, uint256 debtAmountRestored, uint256 drawnSharesLiquidated, PremiumDelta premiumDelta, uint256 collateralAmountRemoved, uint256 collateralSharesLiquidated, uint256 collateralSharesToLiquidator)",
  "event SetUsingAsCollateral(uint256 indexed reserveId, address indexed caller, address indexed user, bool usingAsCollateral)",
]);

export const hubAbi = parseAbi([
  "struct AssetConfig { address feeReceiver; uint16 liquidityFee; address irStrategy; address reinvestmentController; }",
  "function getAssetDrawnRate(uint256 assetId) view returns (uint256)",
  "function getAssetLiquidity(uint256 assetId) view returns (uint256)",
  "function getAddedAssets(uint256 assetId) view returns (uint256)",
  "function getAssetTotalOwed(uint256 assetId) view returns (uint256)",
  "function getAssetConfig(uint256 assetId) view returns (AssetConfig)",
]);

export const oracleAbi = parseAbi(["function getReservePrice(uint256 reserveId) view returns (uint256)"]);

export const symbolAbi = parseAbi(["function symbol() view returns (string)"]);
