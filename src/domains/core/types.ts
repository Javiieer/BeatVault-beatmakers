export type EntityId = string

export type ISODateString = string

export interface DomainEntity {
  id: EntityId
  createdAt: ISODateString
  updatedAt: ISODateString
}
