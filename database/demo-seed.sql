USE food_donation;
-- OPTIONAL classroom demo data. Run only on a fresh schema with empty operational tables.
-- These are fictional records for testing workflows, not impact claims.
INSERT INTO NGO(NGO_ID,Name,Reg_No,Phone,Email,City) VALUES
 (1,'Demo Community Food Network','DEMO-NGO-001','9999000001','hello@communityfood.example','Noida'),
 (2,'Demo Nourish Neighbourhood Trust','DEMO-NGO-002','9999000002','care@nourish.example','Ghaziabad');
INSERT INTO Donor(Donor_ID,Name,Donor_Type,Phone,Email,Address,City) VALUES
 (1,'Demo Green Table Kitchen','Restaurant','9999111101','green.table@example.test','Sector 18','Noida'),
 (2,'Demo Aarav Mehta','Individual','9999111102','aarav@example.test','Sector 62','Noida');
INSERT INTO Volunteer(Volunteer_ID,NGO_ID,Name,Phone,Vehicle_Type) VALUES
 (1,1,'Demo Riya Sharma','9999222201','Bike'),(2,2,'Demo Kabir Singh','9999222202','Car');
INSERT INTO Recipient(Recipient_ID,NGO_ID,Name,Family_Size,Phone,Address,Is_Verified) VALUES
 (1,1,'Demo Sunrise Family Centre',12,'9999333301','Sector 15, Noida',TRUE),
 (2,2,'Demo Neighbourhood Support Home',8,'9999333302','Indirapuram, Ghaziabad',TRUE),
 (3,1,'Demo Verification Pending Household',4,'9999333303','Noida',FALSE);
INSERT INTO Food_Donation(Donation_ID,Donor_ID,Category_ID,Food_Item,Quantity,Unit,Donation_Date,Expiry_Date,Status) VALUES
 (1,1,1,'Demo freshly prepared lunch boxes',45,'plates',CURRENT_DATE(),DATE_ADD(CURRENT_DATE(),INTERVAL 1 DAY),'Available'),
 (2,2,3,'Demo seasonal fruit crates',18,'kg',CURRENT_DATE(),DATE_ADD(CURRENT_DATE(),INTERVAL 2 DAY),'Available'),
 (3,1,4,'Demo assorted bread loaves',30,'pieces',CURRENT_DATE(),DATE_ADD(CURRENT_DATE(),INTERVAL 2 DAY),'Available');
