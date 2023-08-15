import { BigNumber, BigNumberish } from '@ethersproject/bignumber';
import { ContractTransaction } from '@ethersproject/contracts';
import { getEventArgs, MONTH_SEC, OptionType, PositionState, toBN, UNIT } from '../../../scripts/util/web3utils';
import {
  openPositionWithOverrides,
} from '../../utils/contractHelpers';
import { fastForward } from '../../utils/evm';
import { seedFixture } from '../../utils/fixture';
import { createDefaultBoardWithOverrides, mockPrice } from '../../utils/seedTestSystem';
import { expect, hre } from '../../utils/testSetup';

describe('Test Buy', async () => {
  const collaterals = [toBN('0'), toBN('0'), toBN('1'), toBN('1500'), toBN('1500')];

  let oldUserQuoteBal: BigNumber;
  let oldUserBaseBal: BigNumber;
  let oldOMBalance: BigNumber;

  beforeEach(async () => {
    await seedFixture();
    oldUserQuoteBal = await hre.f.c.snx.quoteAsset.balanceOf(hre.f.deployer.address);
    oldUserBaseBal = await hre.f.c.snx.baseAsset.balanceOf(hre.f.deployer.address);
    oldOMBalance = await hre.f.c.snx.quoteAsset.balanceOf(hre.f.c.optionMarket.address);
  });

  it('Buy a call option', async () => {
    const optionType = OptionType.LONG_CALL;
    const price = '1850';
    // open amount = 1
    await createDefaultBoardWithOverrides(hre.f.c, { strikePrices: [price, price, price] });
    await mockPrice(hre.f.c, toBN(price), 'sETH');

    const oldBalance = await hre.f.c.snx.quoteAsset.balanceOf(hre.f.deployer.address);
    const [, positionId] = await openPositionWithOverrides(hre.f.c, {
      optionType: optionType,
      strikeId: 4,
      amount: 1,
      setCollateralTo: collaterals[optionType],
    });

    const newBalance = await hre.f.c.snx.quoteAsset.balanceOf(hre.f.deployer.address);

    // expect correct balance changes and token minting
    expect(oldBalance.sub(newBalance)).to.gt(0);
    expect(oldBalance.sub(newBalance)).to.lt(parseFloat(price));

    await expectActiveAndAmount(positionId, toBN('1').div(UNIT));
  });

  afterEach(async () => {
    const newUserQuoteBal = await hre.f.c.snx.quoteAsset.balanceOf(hre.f.deployer.address);
    const newUserBaseBal = await hre.f.c.snx.baseAsset.balanceOf(hre.f.deployer.address);
    const newOMBalance = await hre.f.c.snx.quoteAsset.balanceOf(hre.f.c.optionMarket.address);

    // console.log("UserQuoteBal:", oldUserQuoteBal, "->", newUserQuoteBal);
    // console.log("UserBaseBal:", oldUserBaseBal, "->", newUserBaseBal);
    // console.log("OMBalance:", oldOMBalance, "->", newOMBalance);
  });
});

export async function expectActiveAndAmount(positionId: BigNumberish, amount: BigNumber) {
  const position = await hre.f.c.optionToken.getOptionPosition(positionId);
  expect(position.state).to.eq(PositionState.ACTIVE);
  expect(position.amount).to.eq(amount);
}
