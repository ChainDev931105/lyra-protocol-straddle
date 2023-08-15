import { BigNumber, BigNumberish } from '@ethersproject/bignumber';
import { ContractTransaction } from '@ethersproject/contracts';
import { artifacts, ethers } from "hardhat";
import { getEventArgs, MONTH_SEC, OptionType, PositionState, toBN, UNIT } from '../../../scripts/util/web3utils';
import {
  openPositionWithOverrides,
} from '../../utils/contractHelpers';
import { fastForward } from '../../utils/evm';
import { seedFixture } from '../../utils/fixture';
import { createDefaultBoardWithOverrides, mockPrice } from '../../utils/seedTestSystem';
import { expect, hre } from '../../utils/testSetup';

import { StraddleMarket } from '../../../typechain-types';

describe('Test Straddle', async () => {
  let straddleMarket: StraddleMarket;

  beforeEach(async () => {
    await seedFixture();
  });

  it('Deployment & Init', async () => {
    const INITIAL_AIRDROP = ethers.utils.parseEther('100');
    const STRIKE_ID = 4;
    const PRICE = '1850';
    const AMOUNT = ethers.utils.parseEther("0.1");
    const COLLATERAL = ethers.utils.parseEther("50");

    const straddleMarketFactory = await ethers.getContractFactory("StraddleMarket");
    straddleMarket = await straddleMarketFactory.deploy();
    await straddleMarket.deployed();

    await straddleMarket.init(
      hre.f.c.optionMarket.address,
      hre.f.c.liquidityPool.address,
      hre.f.c.optionToken.address,
      hre.f.c.snx.quoteAsset.address,
      hre.f.c.snx.baseAsset.address
    );

    // Airdrop to Alice
    await hre.f.c.snx.quoteAsset.transfer(hre.f.alice.address, INITIAL_AIRDROP);

    await createDefaultBoardWithOverrides(hre.f.c, { strikePrices: [PRICE, PRICE, PRICE] });
    await mockPrice(hre.f.c, toBN(PRICE), 'sETH');

    await _logBalances();

    await hre.f.c.snx.quoteAsset.connect(hre.f.alice).approve(straddleMarket.address, COLLATERAL);

    // buy straddle
    const tx = await straddleMarket.connect(hre.f.alice).buyStraddle(AMOUNT, COLLATERAL, STRIKE_ID);

    await _logBalances();

    // Analyze events to get callId and putId
    const event = (await tx.wait()).events?.find(e => e.event === "StraddleBought");
    const callId = event?.args?.callId;
    const putId = event?.args?.putId;

    expect(callId).not.to.eq(0);
    expect(putId).not.to.eq(0);

    // settle amount = 1
    await fastForward(MONTH_SEC);

    // sell straddle by passing callId and putId
    await hre.f.c.optionToken.connect(hre.f.alice).approve(straddleMarket.address, callId);
    await hre.f.c.optionToken.connect(hre.f.alice).approve(straddleMarket.address, putId);
    await straddleMarket.connect(hre.f.alice).sellStraddle(STRIKE_ID, callId, putId);

    await _logBalances();
  });

  async function _logBalances() {
    console.log({
      userBase: await hre.f.c.snx.baseAsset.balanceOf(hre.f.alice.address),
      userQuote: await hre.f.c.snx.quoteAsset.balanceOf(hre.f.alice.address),
      contractBase: await hre.f.c.snx.baseAsset.balanceOf(straddleMarket.address),
      contractQuote: await hre.f.c.snx.quoteAsset.balanceOf(straddleMarket.address)
    });
  }
});
