/** The five assignment concepts are requirements, not generated results. */
export const CONCEPTS = [
  {
    id: 'pythagoras', number: '01', name: "Pythagoras’ theorem", subject: 'Maths',
    prompt: 'In a right-angled triangle, the longest side is called the hypotenuse. The square of the hypotenuse is equal to the sum of the squares of the other two sides: a² + b² = c².'
  },
  {
    id: 'circle', number: '02', name: 'Parts of a circle', subject: 'Maths',
    prompt: 'A circle has a centre. The radius is the distance from the centre to the edge. The diameter goes across the circle through the centre and is twice the radius. The circumference is the distance around the circle.'
  },
  {
    id: 'series', number: '03', name: 'Series circuit', subject: 'Physics',
    prompt: 'In a series circuit there is only one loop. The current is the same everywhere in the loop. The voltage of the cell is shared between the components.'
  },
  {
    id: 'photosynthesis', number: '04', name: 'Photosynthesis', subject: 'Biology',
    prompt: 'Plants take in carbon dioxide and water. They use light energy, absorbed by chlorophyll, to make glucose and oxygen.'
  },
  {
    id: 'matter', number: '05', name: 'States of matter', subject: 'Chemistry',
    prompt: 'In a solid the particles are close together and vibrate in place. In a liquid they are close but move past each other. In a gas they are far apart and move fast.'
  }
];

export const CHECKS = [
  { id: 'svg_parse', label: 'Valid SVG' },
  { id: 'bounds', label: 'Within viewBox' },
  { id: 'labels', label: 'Title + 3 labels' },
  { id: 'animation', label: 'Animation present' },
  { id: 'safety', label: 'Safe SVG' }
];

export const CONCEPT_IDS = new Set(CONCEPTS.map((item) => item.id));
