from app.database import SessionLocal, engine, Base
from app.models import Item

Base.metadata.create_all(bind=engine)

db = SessionLocal()

items = [
    Item(name="Item 1", description="Description for item 1"),
    Item(name="Item 2", description="Description for item 2"),
    Item(name="Item 3", description="Description for item 3"),
    Item(name="Item 4", description="Description for item 4"),
    Item(name="Item 5", description="Description for item 5"),
]

db.add_all(items)
db.commit()
db.close()

print("Seed data inserted.")
