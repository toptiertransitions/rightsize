import { CALCULATOR_CONFIG } from "./config";
import type {
  CalculatorInput,
  CalculatorResult,
  CalculatorRoom,
} from "./types";

export function calculateRoomHours(room: CalculatorRoom): number {
  const { rightsizingRatePerHundredSqFt, densityMultipliers } =
    CALCULATOR_CONFIG;
  const multiplier = densityMultipliers[room.density];
  return (room.squareFeet / 100) * rightsizingRatePerHundredSqFt * multiplier;
}

export function runCalculator(input: CalculatorInput): CalculatorResult {
  const { rooms, destinationSqFt, helperType } = input;
  const { packingRatePerHundredSqFt, unpackingRatePerHundredSqFt, helperHoursPerWeek } =
    CALCULATOR_CONFIG;

  const roomBreakdown = rooms.map((room) => ({
    name: room.name,
    roomType: room.roomType,
    squareFeet: room.squareFeet,
    density: room.density,
    hours: calculateRoomHours(room),
  }));

  const rightsizingHours = roomBreakdown.reduce((sum, r) => sum + r.hours, 0);
  const packingHours = (destinationSqFt / 100) * packingRatePerHundredSqFt;
  const unpackingHours = (destinationSqFt / 100) * unpackingRatePerHundredSqFt;
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
