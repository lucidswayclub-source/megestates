// Sample plot records for the Digital Plot Passport demo.
// Brief §08 / accuracy control: replace these with approved MegEstates plot data
// before launch. Nothing here is a real plot, price or availability.

export const STATUS_LABEL = {
  available: 'Available',
  reserved: 'Reserved',
  booked: 'Booked',
  sold: 'Sold',
  'not-for-sale': 'Not for sale',
};

const AREAS = [150, 180, 200];
const FACINGS = ['East', 'North', 'West', 'South'];
const ROADS = [30, 40, 60];

export const PLOTS = Array.from({ length: 40 }, (_, i) => {
  const s = (i * 7 + (i % 5) * 3) % 10;
  const status =
    s < 4 ? 'available' :
    s < 6 ? 'reserved' :
    s < 8 ? 'booked' :
    s < 9 ? 'sold' : 'not-for-sale';

  return {
    id: `MEG-${String(i + 1).padStart(3, '0')}`,
    status,
    area: AREAS[i % AREAS.length],
    facing: FACINGS[i % FACINGS.length],
    road: ROADS[(i + 1) % ROADS.length],
    corner: i % 6 === 0,
  };
});
