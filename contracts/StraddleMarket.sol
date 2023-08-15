//SPDX-License-Identifier: ISC
pragma solidity 0.8.16;

// Libraries
import "./synthetix/DecimalMath.sol";
import "./libraries/ConvertDecimals.sol";

// Inherited
import "./synthetix/Owned.sol";
import "./libraries/SimpleInitializable.sol";
import "openzeppelin-contracts-4.4.1/security/ReentrancyGuard.sol";

// Interfaces
import "./interfaces/IERC20Decimals.sol";
import "./libraries/PoolHedger.sol";
import "./LiquidityPool.sol";
import "./OptionMarket.sol";
import "./OptionToken.sol";
import "hardhat/console.sol";

/**
 * @title StraddleMarket
 * @author
 * @dev
 */
contract StraddleMarket is Owned, SimpleInitializable, ReentrancyGuard {
  using DecimalMath for uint;

  OptionMarket internal optionMarket;
  LiquidityPool internal liquidityPool;
  OptionToken internal optionToken;
  IERC20Decimals internal quoteAsset;
  IERC20Decimals internal baseAsset;

  constructor() {}

  /**
   * @dev Initialize the contract.
   */
  function init(
    OptionMarket _optionMarket,
    LiquidityPool _liquidityPool,
    OptionToken _optionToken,
    IERC20Decimals _quoteAsset,
    IERC20Decimals _baseAsset
  ) external onlyOwner initializer {
    optionMarket = _optionMarket;
    liquidityPool = _liquidityPool;
    optionToken = _optionToken;
    quoteAsset = _quoteAsset;
    baseAsset = _baseAsset;

    quoteAsset.approve(address(optionMarket), type(uint).max);
    baseAsset.approve(address(optionMarket), type(uint).max);
  }

  function buyStraddle(
    uint amount,
    uint collateral,
    uint strikeId
  ) external nonReentrant returns (uint callId, uint putId) {
    // Step 1. Receive collateral
    uint orgBalance = quoteAsset.balanceOf(address(this));
    if (!quoteAsset.transferFrom(msg.sender, address(this), collateral)) {
      revert TransferFailed(address(this), address(quoteAsset), msg.sender, address(this), amount);
    }

    // Step 2. Buy a call option
    OptionMarket.Result memory resultCall = optionMarket.openPosition(
      OptionMarket.TradeInputParameters({
        strikeId: strikeId,
        positionId: 0,
        iterations: 1,
        optionType: OptionMarket.OptionType.LONG_CALL,
        amount: amount,
        setCollateralTo: 0,
        minTotalCost: 0,
        maxTotalCost: type(uint).max,
        referrer: address(0)
      })
    );

    // Step 3. Buy a put option
    OptionMarket.Result memory resultPut = optionMarket.openPosition(
      OptionMarket.TradeInputParameters({
        strikeId: strikeId,
        positionId: 0,
        iterations: 1,
        optionType: OptionMarket.OptionType.LONG_PUT,
        amount: amount,
        setCollateralTo: 0,
        minTotalCost: 0,
        maxTotalCost: type(uint).max,
        referrer: address(0)
      })
    );

    // Step 4. Return remained collateral
    uint newBalance = quoteAsset.balanceOf(address(this));
    if (newBalance < orgBalance) {
      // revert if insufficient collateral
      revert InsufficientCollateral(collateral, collateral + orgBalance - newBalance);
    }
    if (newBalance != orgBalance && !quoteAsset.transfer(msg.sender, newBalance - orgBalance)) {
      revert TransferFailed(address(this), address(quoteAsset), address(this), msg.sender, amount);
    }

    // Step 5. Transfer optionToken to the user
    callId = resultCall.positionId;
    putId = resultPut.positionId;

    optionToken.transferFrom(address(this), msg.sender, callId);
    optionToken.transferFrom(address(this), msg.sender, putId);

    emit StraddleBought(msg.sender, amount, collateral, strikeId, callId, putId);
  }

  function sellStraddle(
    uint256 strikeId,
    uint callId,
    uint putId
  ) external nonReentrant {
    if (callId == 0 || putId == 0) {
      revert InvalidCallOrPutId(callId, putId);
    }

    // Step 1. Receive option Tokens from user
    optionToken.transferFrom(msg.sender, address(this), callId);
    optionToken.transferFrom(msg.sender, address(this), putId);

    // Step 2. close call position
    optionMarket.closePosition(
      OptionMarket.TradeInputParameters({
        strikeId: strikeId,
        positionId: callId,
        iterations: 1,
        optionType: OptionMarket.OptionType.LONG_CALL,
        amount: 0,
        setCollateralTo: 0,
        minTotalCost: 0,
        maxTotalCost: type(uint).max,
        referrer: address(0)
      })
    );
    // Step 3. close put position
    optionMarket.closePosition(
      OptionMarket.TradeInputParameters({
        strikeId: strikeId,
        positionId: putId,
        iterations: 1,
        optionType: OptionMarket.OptionType.LONG_PUT,
        amount: 0,
        setCollateralTo: 0,
        minTotalCost: 0,
        maxTotalCost: type(uint).max,
        referrer: address(0)
      })
    );
  }

  error TransferFailed(address thrower, address token, address from, address to, uint amount);
  error InsufficientCollateral(uint collateral, uint expectedCollateral);
  error InvalidCallOrPutId(uint callId, uint putId);
  
  event StraddleBought(address user, uint amount, uint collateral, uint strikeId, uint callId, uint putId);
}
