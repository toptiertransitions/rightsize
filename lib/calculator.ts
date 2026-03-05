import { CALCULATOR_CONFIG } from "./config";
import type {
  CalculatorInput,
  CalculatorResult,
  CalculatorRoom,
  ContractSettings,
  DensityLevel,
  Service,
  Room,
} from "./types";

export interface EstimatorRates {
  rightsizingLow: number;
  rightsizingAvg: number;
  rightsizingHigh: number;
  packingPerHundred: number;
  unpackingPerHundred: number;
}

export function settingsToRates(settings: ContractSettings | null): EstimatorRates {
  return {
    rightsizingLow: settings?.rightsizingLow ?? CALCULATOR_CONFIG.rightsizingRatePerHundredSqFt * CALCULATOR_CONFIG.densityMultipliers.Low,
    rightsizingAvg: settings?.rightsizingAvg ?? CALCULATOR_CONFIG.rightsizingRatePerHundredSqFt * CALCULATOR_CONFIG.densityMultipliers.Medium,
    rightsizingHigh: settings?.rightsizingHigh ?? CALCULATOR_CONFIG.rightsizingRatePerHundredSqFt * CALCULATOR_CONFIG.densityMultipliers.High,
    packingPerHundred: settings?.packingPerHundred ?? CALCULATOR_CONFIG.packingRatePerHundredSqFt,
    unpackingPerHundred: settings?.unpackingPerHundred ?? CALCULATOR_CONFIG.unpackingRatePerHundredSqFt,
  };
}

export function calculateRoomHours(room: CalculatorRoom, rates?: EstimatorRates): number {
  if (rates) {
    const rateMap = { Low: rates.rightsizingLow, Medium: rates.rightsizingAvg, High: rates.rightsizingHigh };
    return (room.squareFeet / 100) * rateMap[room.density];
  }
  const { rightsizingRatePerHundredSqFt, densityMultipliers } = CALCULATOR_CONFIG;
  return (room.squareFeet / 100) * rightsizingRatePerHundredSqFt * densityMultipliers[room.density];
}

export function calculateServiceHours(
  service: Pick<Service, "estimatorLow" | "estimatorAvg" | "estimatorHigh">,
  rooms: Pick<Room, "squareFeet" | "density">[]
): number {
  const rateMap: Record<DensityLevel, number> = {
    Low: service.estimatorLow,
    Medium: service.estimatorAvg,
    High: service.estimatorHigh,
  };
  const total = rooms.reduce((sum, room) => sum + (room.squareFeet / 100) * rateMap[room.density], 0);
  return Math.round(total * 10) / 10;
}

export function runCalculator(input: CalculatorInput, rates?: EstimatorRates): CalculatorResult {
  const { rooms, destinationSqFt, helperType } = input;
  const { helperHoursPerWeek } = CALCULATOR_CONFIG;

  const packingRate = rates?.packingPerHundred ?? CALCULATOR_CONFIG.packingRatePerHundredSqFt;
  const unpackingRate = rates?.unpackingPerHundred ?? CALCULATOR_CONFIG.unpackingRatePerHundredSqFt;

  const roomBreakdown = rooms.map((room) => ({
    name: room.name,
    roomType: room.roomType,
    squareFeet: room.squareFeet,
    density: room.density,
    hours: calculateRoomHours(room, rates),
  }));

  const rightsizingHours = roomBreakdown.reduce((sum, r) => sum + r.hours, 0);
  const packingHours = (destinationSqFt / 100) * packingRate;
  const unpackingHours = (destinationSqFt / 100) * unpackingRate;
  const totalHours = rightsizingHours + packingHours + unpackingHours;
  const hoursPerWeek = helperHoursPerWeek[helperType];
  const estimatedWeeks = Math.ceil(totalHours / hoursPerWeek);

  return {
    rightsizingHours: Math.round(rightsizingHours * 10) / 10,
    packingHours: Math.round(packingHours * 10) / 10,
    unpackingHours: Math.round(unpackingHours * 10) / 10,
    totalHours: Math.round(totalHours * 10) / 10,
    estimatedWeeks,
    helperType,
    roomBreakdown,
  };
}
